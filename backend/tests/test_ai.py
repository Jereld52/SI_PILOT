from app.db.session import SessionLocal
from app.models.ai import AiRun
from app.models.auth import User
from app.models.calendar import ActionItem
from app.services import ai_service, ai_tools_service
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

    runs = client.get("/api/v1/ai/runs", params={"limit": 5})
    assert runs.status_code == 200, runs.text
    assert any(
        "bilan du parc" in (item["request_summary"] or "").lower()
        for item in runs.json()
    )


def test_ai_compose_text(admin_client, csrf_headers, monkeypatch):
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
        },
    )

    def fake_complete(config, messages, max_tokens=None):  # noqa: ANN001, ARG001
        assert any("demande IT" in message["content"] for message in messages)
        return (
            "Le poste ne démarre plus depuis ce matin. L'utilisateur ne peut plus "
            "travailler. Vérifier l'alimentation et le disque.",
            {"total_tokens": 50},
        )

    monkeypatch.setattr(ai_service, "_complete", fake_complete)
    response = client.post(
        "/api/v1/ai/compose",
        headers=csrf_headers(csrf),
        json={
            "kind": "ticket",
            "field": "description",
            "title": "Poste ne démarre plus",
            "tone": "professional",
            "length": "medium",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["text"].startswith("Le poste ne démarre")
    assert body["kind"] == "ticket"
    assert body["field"] == "description"
    assert body["duration_ms"] >= 0


def test_ai_action_proposal_and_execution(admin_client, csrf_headers, monkeypatch):
    client, csrf = admin_client
    client.put(
        "/api/v1/admin/ai/config",
        headers=csrf_headers(csrf),
        json={
            "enabled": True,
            "provider": "openai",
            "base_url": "https://api.openai.com/v1",
            "model": "gpt-4.1-mini",
            "api_key": "sk-test-secret",
        },
    )

    def fake_complete(config, messages, max_tokens=None):  # noqa: ANN001, ARG001
        return (
            "Je peux préparer cette action de suivi.\n"
            "```action\n"
            '{"type": "create_action", "title": "Vérifier les sauvegardes Veeam", '
            '"description": "Contrôler les jobs en échec signalés par le briefing.", '
            '"priority": "high", "due_date": "2026-12-01"}\n'
            "```",
            None,
        )

    monkeypatch.setattr(ai_service, "_complete", fake_complete)
    response = client.post(
        "/api/v1/ai/chat",
        headers=csrf_headers(csrf),
        json={"messages": [{"role": "user", "content": "Crée une action de suivi."}]},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert "```action" not in body["message"]
    assert len(body["actions"]) == 1
    action = body["actions"][0]
    assert action["title"] == "Vérifier les sauvegardes Veeam"
    assert action["priority"] == "high"

    executed = client.post(
        "/api/v1/ai/actions/execute",
        headers=csrf_headers(csrf),
        json=action,
    )
    assert executed.status_code == 200, executed.text
    assert "Action créée" in executed.json()["message"]

    with SessionLocal() as db:
        row = db.scalar(
            select(ActionItem).where(ActionItem.title == action["title"])
        )
        assert row is not None
        db.delete(row)
        db.commit()


def test_ai_model_discovery(admin_client, csrf_headers, monkeypatch):
    client, csrf = admin_client
    client.put(
        "/api/v1/admin/ai/config",
        headers=csrf_headers(csrf),
        json={
            "enabled": True,
            "provider": "openai",
            "base_url": "https://api.example.test/v1",
            "model": "gpt-test",
            "api_key": "sk-test-secret",
        },
    )

    class FakeResponse:
        status_code = 200
        text = ""

        def json(self):
            return {"data": [{"id": "gpt-a"}, {"id": "gpt-b"}]}

    class FakeClient:
        def __init__(self, *args, **kwargs):  # noqa: ANN002, ANN003
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):  # noqa: ANN002
            return False

        def get(self, *args, **kwargs):  # noqa: ANN002, ANN003
            return FakeResponse()

    monkeypatch.setattr(ai_service.httpx, "Client", FakeClient)
    response = client.get("/api/v1/admin/ai/models")
    assert response.status_code == 200, response.text
    assert response.json()["models"] == ["gpt-a", "gpt-b"]


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


def test_ai_chat_with_asset_context(admin_client, csrf_headers, monkeypatch):
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
    categories = client.get("/api/v1/asset-categories").json()
    desktop = next(item for item in categories if item["code"] == "desktop")
    created = client.post(
        "/api/v1/assets",
        headers=csrf_headers(csrf),
        json={
            "name": "Poste analyse IA",
            "hostname": "IA-POSTE-01",
            "category_id": desktop["id"],
            "status": "in_service",
        },
    )
    assert created.status_code == 201, created.text
    asset_id = created.json()["id"]

    captured: dict = {}

    def fake_complete(config, messages, max_tokens=None):  # noqa: ANN001, ARG001
        captured["messages"] = messages
        return ("Analyse terminée.", None)

    monkeypatch.setattr(ai_service, "_complete", fake_complete)
    response = client.post(
        "/api/v1/ai/chat",
        headers=csrf_headers(csrf),
        json={
            "messages": [
                {"role": "user", "content": "Analyse ce poste."}
            ],
            "include_context": True,
            "context": {"type": "asset", "id": asset_id},
        },
    )
    assert response.status_code == 200, response.text
    system = captured["messages"][0]["content"]
    assert "Contexte ciblé — Équipement" in system
    assert "IA-POSTE-01" in system


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


def test_tool_router_selects_relevant_tools():
    with SessionLocal() as db:
        actor = db.scalar(select(User).where(User.email == "admin.test@example.org"))
        assert actor is not None

        broken = [call[0] for call in ai_tools_service.select_tools(
            "Quels postes sont en panne ?", actor
        )]
        assert "assets_broken" in broken
        assert "search_assets" not in broken

        overdue = [call[0] for call in ai_tools_service.select_tools(
            "Quels tickets sont en retard ?", actor
        )]
        assert "tickets_overdue" in overdue

        updates = [call[0] for call in ai_tools_service.select_tools(
            "Quelles mises à jour WAPT sont en attente ?", actor
        )]
        assert "software_updates" in updates

        user = [call[0] for call in ai_tools_service.select_tools(
            "Qui utilise le poste PORT-PN001 ?", actor
        )]
        assert "agent_lookup" in user or "search_assets" in user

        onboarding = [call[0] for call in ai_tools_service.select_tools(
            "Quelles arrivées sont incomplètes ?", actor
        )]
        assert "onboarding_briefing" in onboarding

        briefing = [call[0] for call in ai_tools_service.select_tools(
            "Fais-moi le briefing du jour.", actor
        )]
        assert "daily_briefing" in briefing

        monthly = [call[0] for call in ai_tools_service.select_tools(
            "Prépare le rapport mensuel pour la direction.", actor
        )]
        assert "monthly_report_summary" in monthly

        stock = [call[0] for call in ai_tools_service.select_tools(
            "Quels articles sont sous le seuil d'alerte ?", actor
        )]
        assert "stock_overview" in stock

        budget = [call[0] for call in ai_tools_service.select_tools(
            "Analyse le budget et les montants engagés.", actor
        )]
        assert "budget_overview" in budget

        projects = [call[0] for call in ai_tools_service.select_tools(
            "Quels projets sont en retard ?", actor
        )]
        assert "projects_at_risk" in projects

        quality = [call[0] for call in ai_tools_service.select_tools(
            "Analyse les anomalies de qualité des données.", actor
        )]
        assert "data_quality_overview" in quality


def test_ai_tools_endpoint(admin_client):
    client, _ = admin_client
    response = client.get("/api/v1/ai/tools")
    assert response.status_code == 200, response.text
    keys = {tool["key"] for tool in response.json()}
    assert {
        "assets_broken",
        "tickets_overdue",
        "software_updates",
        "contracts_expiring",
        "onboarding_briefing",
        "stock_overview",
        "budget_overview",
        "projects_at_risk",
        "data_quality_overview",
    } <= keys
    domains = {tool["key"]: tool["domain"] for tool in response.json()}
    assert domains["assets_broken"] == "parc"
    assert domains["tickets_overdue"] == "support"
    assert domains["contracts_expiring"] == "achats"
    assert domains["onboarding_briefing"] == "agents"


def test_ai_chat_uses_tools(admin_client, csrf_headers, monkeypatch):
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
    categories = client.get("/api/v1/asset-categories").json()
    desktop = next(item for item in categories if item["code"] == "desktop")
    created = client.post(
        "/api/v1/assets",
        headers=csrf_headers(csrf),
        json={
            "name": "Poste en panne IA",
            "hostname": "IA-BROKEN-01",
            "category_id": desktop["id"],
            "status": "broken",
        },
    )
    assert created.status_code == 201, created.text

    captured: dict = {}

    def fake_complete(config, messages, max_tokens=None):  # noqa: ANN001, ARG001
        captured["messages"] = messages
        return ("Un poste est en panne.", None)

    monkeypatch.setattr(ai_service, "_complete", fake_complete)
    response = client.post(
        "/api/v1/ai/chat",
        headers=csrf_headers(csrf),
        json={
            "messages": [{"role": "user", "content": "Quels postes sont en panne ?"}],
            "include_context": True,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert "assets_broken" in body["tools_used"]
    system = captured["messages"][0]["content"]
    assert "Équipements en panne" in system
    assert "IA-BROKEN-01" in system


def test_fleet_context_contains_sections():
    with SessionLocal() as db:
        context = ai_service._fleet_context(db)
    assert context.startswith("Contexte du parc")
    assert "Équipements actifs" in context



def test_ai_conversations_persistence(admin_client, csrf_headers, monkeypatch):
    client, csrf = admin_client
    client.put(
        "/api/v1/admin/ai/config",
        headers=csrf_headers(csrf),
        json={
            "enabled": True,
            "provider": "openai",
            "base_url": "https://api.openai.com/v1",
            "model": "gpt-4.1-mini",
            "api_key": "sk-test-secret",
        },
    )

    def fake_complete(config, messages, max_tokens=None):  # noqa: ANN001, ARG001
        return (
            "Voici l'analyse demandee.\n"
            "```action\n"
            '{"type": "create_action", "title": "Verifier le parc", '
            '"description": "Controler les equipements signales.", '
            '"priority": "medium", "due_date": "2026-12-01"}\n'
            "```",
            {"total_tokens": 42},
        )

    monkeypatch.setattr(ai_service, "_complete", fake_complete)

    created = client.post(
        "/api/v1/ai/conversations",
        headers=csrf_headers(csrf),
        json={},
    )
    assert created.status_code == 200, created.text
    conversation = created.json()
    assert conversation["title"] == "Nouvelle conversation"
    conversation_id = conversation["id"]

    sent = client.post(
        f"/api/v1/ai/conversations/{conversation_id}/messages",
        headers=csrf_headers(csrf),
        json={"content": "Quels equipements sont en panne ?"},
    )
    assert sent.status_code == 200, sent.text
    body = sent.json()
    assert body["conversation"]["message_count"] == 2
    assert body["conversation"]["title"].startswith("Quels equipements")
    assert body["user_message"]["role"] == "user"
    assert body["assistant_message"]["role"] == "assistant"
    assert "```action" not in body["assistant_message"]["content"]
    assert body["assistant_message"]["actions"][0]["title"] == "Verifier le parc"
    assistant_message_id = body["assistant_message"]["id"]

    detail = client.get(f"/api/v1/ai/conversations/{conversation_id}")
    assert detail.status_code == 200, detail.text
    assert len(detail.json()["messages"]) == 2

    listed = client.get("/api/v1/ai/conversations", params={"q": "equipements"})
    assert listed.status_code == 200, listed.text
    assert any(item["id"] == conversation_id for item in listed.json())

    renamed = client.patch(
        f"/api/v1/ai/conversations/{conversation_id}",
        headers=csrf_headers(csrf),
        json={"title": "Analyse du parc"},
    )
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["title"] == "Analyse du parc"

    marked = client.patch(
        f"/api/v1/ai/conversations/{conversation_id}/messages/{assistant_message_id}/actions",
        headers=csrf_headers(csrf),
        json={"state": "done"},
    )
    assert marked.status_code == 200, marked.text
    assert marked.json()["actions_done"] is True

    archived = client.patch(
        f"/api/v1/ai/conversations/{conversation_id}",
        headers=csrf_headers(csrf),
        json={"archived": True},
    )
    assert archived.status_code == 200, archived.text
    assert archived.json()["archived_at"] is not None

    active = client.get(
        "/api/v1/ai/conversations", params={"archived": "active"}
    )
    assert all(item["id"] != conversation_id for item in active.json())
    archived_list = client.get(
        "/api/v1/ai/conversations", params={"archived": "archived"}
    )
    assert any(item["id"] == conversation_id for item in archived_list.json())

    export_md = client.get(
        f"/api/v1/ai/conversations/{conversation_id}/export",
        params={"format": "md"},
    )
    assert export_md.status_code == 200, export_md.text
    assert "text/markdown" in export_md.headers["content-type"]
    assert "# Analyse du parc" in export_md.text

    export_pdf = client.get(
        f"/api/v1/ai/conversations/{conversation_id}/export",
        params={"format": "pdf"},
    )
    assert export_pdf.status_code == 200, export_pdf.text
    assert export_pdf.headers["content-type"].startswith("application/pdf")
    assert export_pdf.content.startswith(b"%PDF")

    deleted = client.delete(
        f"/api/v1/ai/conversations/{conversation_id}",
        headers=csrf_headers(csrf),
    )
    assert deleted.status_code == 204, deleted.text
    missing = client.get(f"/api/v1/ai/conversations/{conversation_id}")
    assert missing.status_code == 404
