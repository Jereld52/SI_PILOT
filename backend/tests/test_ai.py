from app.db.session import SessionLocal
from app.models.ai import AiRun
from app.services import ai_service
from sqlalchemy import select


def test_ai_config_update_and_status(admin_client, csrf_headers):
    client, csrf = admin_client
    initial = client.get("/api/v1/admin/ai/config")
    assert initial.status_code == 200, initial.text

    updated = client.put(
        "/api/v1/admin/ai/config",
        headers=csrf_headers(csrf),
        json={
            "enabled": True,
            "provider": "openai",
            "base_url": "https://api.openai.com/v1",
            "model": "gpt-4.1-mini",
            "api_key": "sk-test-secret",
            "temperature": 0.1,
            "max_tokens": 800,
            "timeout_seconds": 45,
            "include_fleet_context": True,
        },
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["configured"] is True
    assert body["api_key_set"] is True
    assert "sk-test-secret" not in updated.text

    status = client.get("/api/v1/ai/status")
    assert status.status_code == 200, status.text
    assert status.json()["configured"] is True
    assert status.json()["model"] == "gpt-4.1-mini"


def test_ai_chat_records_run(admin_client, csrf_headers, monkeypatch):
    client, csrf = admin_client
    client.put(
        "/api/v1/admin/ai/config",
        headers=csrf_headers(csrf),
        json={
            "enabled": True,
            "provider": "openai",
            "base_url": "https://api.openai.com/v1",
            "model": "gpt-4.1-mini",
            "api_key": None,
            "include_fleet_context": True,
        },
    )

    def fake_complete(config, messages, max_tokens=None):  # noqa: ANN001, ARG001
        assert any("Contexte du parc" in message["content"] for message in messages)
        return ("Bilan du parc : 0 alerte critique.", {"total_tokens": 42})

    monkeypatch.setattr(ai_service, "_complete", fake_complete)
    response = client.post(
        "/api/v1/ai/chat",
        headers=csrf_headers(csrf),
        json={
            "messages": [{"role": "user", "content": "Fais un bilan du parc."}],
            "include_context": True,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["message"] == "Bilan du parc : 0 alerte critique."
    assert body["usage"] == {"total_tokens": 42}

    with SessionLocal() as db:
        run = db.scalar(
            select(AiRun)
            .where(AiRun.feature_code == "assistant_chat")
            .order_by(AiRun.created_at.desc())
        )
        assert run is not None
        assert run.status == "success"
        assert "bilan du parc" in (run.request_summary or "").lower()


def test_ai_chat_disabled_is_explicit(admin_client, csrf_headers):
    client, csrf = admin_client
    client.put(
        "/api/v1/admin/ai/config",
        headers=csrf_headers(csrf),
        json={
            "enabled": False,
            "provider": "openai",
            "base_url": "https://api.openai.com/v1",
            "model": "gpt-4.1-mini",
            "api_key": None,
            "include_fleet_context": True,
        },
    )
    response = client.post(
        "/api/v1/ai/chat",
        headers=csrf_headers(csrf),
        json={"messages": [{"role": "user", "content": "Bilan ?"}]},
    )
    assert response.status_code == 422
    assert "désactivé" in response.json()["detail"]


def test_provider_urls():
    base = dict(
        enabled=True,
        base_url="https://example.test/v1",
        model="demo",
        api_key="secret",
        temperature=0.2,
        max_tokens=100,
        timeout_seconds=30,
        include_fleet_context=True,
    )
    azure = ai_service.AiConfig(provider="azure_openai", **base)
    assert ai_service._provider_url(azure).endswith(
        "/chat/completions?api-version=2024-02-15-preview"
    )
    anthropic = ai_service.AiConfig(provider="anthropic", **base)
    assert ai_service._provider_url(anthropic) == "https://example.test/v1/messages"
    openai = ai_service.AiConfig(provider="openai", **base)
    assert ai_service._provider_url(openai) == "https://example.test/v1/chat/completions"


def test_ollama_adapter_disables_thinking(monkeypatch):
    captured: dict = {}

    class FakeResponse:
        status_code = 200

        def json(self):  # noqa: ANN201
            return {
                "message": {"content": "Bonjour"},
                "prompt_eval_count": 10,
                "eval_count": 3,
            }

    class FakeClient:
        def __init__(self, *args, **kwargs):  # noqa: ANN002, ANN003, ARG002
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):  # noqa: ANN002, ARG002
            return False

        def post(self, url, json=None):  # noqa: ANN001, ARG002
            captured["url"] = url
            captured["payload"] = json
            return FakeResponse()

    monkeypatch.setattr(ai_service.httpx, "Client", FakeClient)
    config = ai_service.AiConfig(
        enabled=True,
        provider="ollama",
        base_url="http://127.0.0.1:11434/v1",
        model="qwen3.5:2b",
        api_key="",
        temperature=0.2,
        max_tokens=100,
        timeout_seconds=30,
        include_fleet_context=True,
    )
    text, usage = ai_service._complete(
        config, [{"role": "user", "content": "Bonjour"}]
    )

    assert captured["url"] == "http://127.0.0.1:11434/api/chat"
    assert captured["payload"]["think"] is False
    assert captured["payload"]["stream"] is False
    assert text == "Bonjour"
    assert usage == {"prompt_tokens": 10, "completion_tokens": 3, "total_tokens": 13}


def test_fleet_context_contains_sections():
    with SessionLocal() as db:
        context = ai_service._fleet_context(db)
    assert context.startswith("Contexte du parc")
    assert "Équipements actifs" in context
