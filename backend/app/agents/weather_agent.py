from app.agents.base_agent import BaseAgent
from app.agents.state import PlanningState
from datetime import date, timedelta
from app.services.weather_service import (
    get_forecast,
    summarize_forecast
)



class WeatherAgent(BaseAgent):

    name = "WeatherAgent"
    requires_fields = ["city", "days"]
    produces_fields = ["weather_info"]

    def can_run(self, state: PlanningState) -> bool:
        return True

    async def run(self, state: PlanningState) -> PlanningState:
        try:
            forecast_data = await get_forecast(
                state.city,
                trip_start_date=state.trip_start_date,
                days=state.days,
            )

            if forecast_data:
                state.weather_info = summarize_forecast(
                    forecast_data,
                    state.days
                )
            else:
                state.weather_info = self._fallback_weather(state.days, state.trip_start_date)
        except Exception as e:
            print(f"WeatherAgent error: {e}")
            state.weather_info = self._fallback_weather(state.days, state.trip_start_date)

        print("Weather summary from forecast:", state.weather_info)

        return state

    def _fallback_weather(self, days: int, start_date: date | None):
        base = start_date or date.today()
        return {
            f"day_{i + 1}": {
                "date": (base + timedelta(days=i)).isoformat(),
                "description": "moderate weather",
                "avg_temperature": 28,
            }
            for i in range(max(days, 1))
        }

    def confidence(self, state: PlanningState) -> float:
        return 0.9

    def explain(self, state: PlanningState) -> str:
        return "Weather forecast generated using weather agent."
