"""
One-time script to get a Google OAuth2 refresh token for the Calendar API.
Run: python get_google_refresh_token.py
"""
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/calendar"]
CLIENT_SECRET_FILE = "/home/rubin/Downloads/client_secret_425485508644-ivcu5hp1ib0k0sn8j5h8m0bsq64a9716.apps.googleusercontent.com.json"

flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_FILE, SCOPES)
creds = flow.run_local_server(port=0)

print("\n=== Add these to your .env file ===\n")
print(f"GOOGLE_CLIENT_ID={creds.client_id}")
print(f"GOOGLE_CLIENT_SECRET={creds.client_secret}")
print(f"GOOGLE_REFRESH_TOKEN={creds.refresh_token}")
print("\n===================================\n")
