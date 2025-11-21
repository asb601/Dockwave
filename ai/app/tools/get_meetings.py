# ai/app/tools/get_meetings.py
"""
Tool to fetch all events and tasks for the current user from the Next.js API.
"""
import requests
from typing import Any, Dict

def get_meetings(api_base_url: str, auth_token: str) -> Dict[str, Any]:
    """
    Fetch all calendar events (with tasks) for the current user.
    Args:
        api_base_url (str): The base URL of the Next.js API (e.g. http://localhost:3000)
        auth_token (str): The user's auth token (JWT/cookie)
    Returns:
        dict: { 'events': [...] }
    Raises:
        Exception: If the request fails.
    """
    url = f"{api_base_url}/api/calendar/events"
    headers = {
        'Content-Type': 'application/json',
        'Cookie': f'next-auth.session-token={auth_token}',
    }
    response = requests.get(url, headers=headers)
    if not response.ok:
        raise Exception(response.text)
    return response.json()

# Usage: LLM or agent can call get_meetings(api_base_url, auth_token) to get all meetings/tasks for the user.
