import argparse
import getpass
import secrets
import sys

from sqlalchemy import func, select

from app.core.security import hash_password, validate_password_strength
from app.db.session import SessionLocal
from app.models.auth import Role, User
from app.seed.reference_data import seed_reference_data
from app.services.auth_service import revoke_all_sessions


def _seed(_: argparse.Namespace) -> None:
    with SessionLocal() as db:
        print(seed_reference_data(db))


def _prompt_password() -> str:
    password = getpass.getpass("Mot de passe : ")
    confirm = getpass.getpass("Confirmation : ")
    if password != confirm:
        print("Les mots de passe ne correspondent pas.", file=sys.stderr)
        raise SystemExit(1)
    errors = validate_password_strength(password)
    if errors:
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        raise SystemExit(1)
    return password


def _create_admin(args: argparse.Namespace) -> None:
    with SessionLocal() as db:
        email = args.email.strip().lower()
        existing = db.scalar(select(User).where(func.lower(User.email) == email))
        if existing:
            print(f"Un compte existe déjà pour {email}.", file=sys.stderr)
            raise SystemExit(1)

        role = db.scalar(select(Role).where(Role.code == "admin"))
        if role is None:
            print("Rôle admin absent. Lancez d'abord : python -m app.cli seed", file=sys.stderr)
            raise SystemExit(1)

        password = args.password
        generated = False
        if not password:
            if args.generate:
                password = secrets.token_urlsafe(18)
                generated = True
            else:
                password = _prompt_password()

        errors = validate_password_strength(password)
        if errors:
            for error in errors:
                print(f"- {error}", file=sys.stderr)
            raise SystemExit(1)

        user = User(
            email=email,
            password_hash=hash_password(password),
            first_name=args.first_name,
            last_name=args.last_name,
            role_id=role.id,
            data_scope="all",
            is_active=True,
            must_change_password=True,
        )
        db.add(user)
        db.commit()
        print(f"Administrateur créé : {email}")
        if generated:
            print(f"Mot de passe initial : {password}")
            print("Conservez-le de façon sûre et changez-le à la première connexion.")


def _bootstrap(args: argparse.Namespace) -> None:
    from app.core.config import settings

    with SessionLocal() as db:
        count = db.scalar(select(func.count()).select_from(User)) or 0
        if count > 0:
            print("Des utilisateurs existent déjà, amorçage ignoré.")
            return
        if not settings.bootstrap_admin_email or not settings.bootstrap_admin_password:
            print(
                "BOOTSTRAP_ADMIN_EMAIL et BOOTSTRAP_ADMIN_PASSWORD doivent être renseignés dans .env.",
                file=sys.stderr,
            )
            raise SystemExit(1)
        role = db.scalar(select(Role).where(Role.code == "admin"))
        if role is None:
            seed_reference_data(db)
            role = db.scalar(select(Role).where(Role.code == "admin"))
        if role is None:
            print("Rôle admin introuvable après initialisation.", file=sys.stderr)
            raise SystemExit(1)
        errors = validate_password_strength(settings.bootstrap_admin_password)
        if errors:
            for error in errors:
                print(f"- {error}", file=sys.stderr)
            raise SystemExit(1)
        user = User(
            email=settings.bootstrap_admin_email.strip().lower(),
            password_hash=hash_password(settings.bootstrap_admin_password),
            first_name="Administrateur",
            last_name="SI PNFor",
            role_id=role.id,
            data_scope="all",
            is_active=True,
            must_change_password=True,
        )
        db.add(user)
        db.commit()
        print(f"Compte administrateur initialisé : {user.email}")


def _reset_password(args: argparse.Namespace) -> None:
    with SessionLocal() as db:
        email = args.email.strip().lower()
        user = db.scalar(select(User).where(func.lower(User.email) == email))
        if user is None:
            print(f"Compte introuvable : {email}", file=sys.stderr)
            raise SystemExit(1)
        password = args.password or _prompt_password()
        errors = validate_password_strength(password)
        if errors:
            for error in errors:
                print(f"- {error}", file=sys.stderr)
            raise SystemExit(1)
        user.password_hash = hash_password(password)
        user.must_change_password = True
        revoke_all_sessions(db, user.id)
        db.commit()
        print(f"Mot de passe réinitialisé pour {email}. Toutes les sessions ont été révoquées.")


def main() -> None:
    parser = argparse.ArgumentParser(description="SI PNFor PILOTE - outil d'administration")
    subparsers = parser.add_subparsers(dest="command", required=True)

    seed_parser = subparsers.add_parser("seed", help="Initialiser les référentiels")
    seed_parser.set_defaults(func=_seed)

    admin_parser = subparsers.add_parser("create-admin", help="Créer un administrateur")
    admin_parser.add_argument("--email", required=True)
    admin_parser.add_argument("--first-name", required=True)
    admin_parser.add_argument("--last-name", required=True)
    admin_parser.add_argument("--password", default="")
    admin_parser.add_argument("--generate", action="store_true")
    admin_parser.set_defaults(func=_create_admin)

    bootstrap_parser = subparsers.add_parser("bootstrap", help="Amorcer le premier administrateur")
    bootstrap_parser.set_defaults(func=_bootstrap)

    reset_parser = subparsers.add_parser("reset-password", help="Réinitialiser un mot de passe")
    reset_parser.add_argument("--email", required=True)
    reset_parser.add_argument("--password", default="")
    reset_parser.set_defaults(func=_reset_password)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
