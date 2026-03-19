from app.services.agent_service import generate_travel_plan
def main(): 
    plan = generate_travel_plan(
        user_id= 1,
        destination= "Goa",
        days = 3,
        pace = "relaxed"
    )

    print(plan)

if __name__ == "__main__":
    main()