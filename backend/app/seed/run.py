from app.db.session import SessionLocal
from app.seed.reference_data import seed_reference_data


def main() -> None:
    with SessionLocal() as db:
        stats = seed_reference_data(db)
    print("Référentiels initialisés :", stats)


if __name__ == "__main__":
    main()
