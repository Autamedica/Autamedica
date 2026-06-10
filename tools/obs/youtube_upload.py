#!/usr/bin/env python3
import os
import sys
import json
from pathlib import Path
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google.oauth2.credentials import Credentials

CLIENT_SECRETS_FILE = "/home/edu/client_secrets.json"
CREDENTIALS_FILE = "/home/edu/.youtube-credentials.json"
SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]


def get_authenticated_service():
    credentials = None
    
    # Load previously saved credentials if they exist
    if os.path.exists(CREDENTIALS_FILE):
        try:
            with open(CREDENTIALS_FILE, 'r') as f:
                creds_data = json.load(f)
                try:
                    credentials = Credentials.from_authorized_user_info(creds_data, SCOPES)
                except ValueError:
                    # Fallback to manual creation if refresh_token is missing but token is still valid
                    if "token" in creds_data:
                        credentials = Credentials(
                            token=creds_data["token"],
                            refresh_token=creds_data.get("refresh_token"),
                            token_uri=creds_data.get("token_uri"),
                            client_id=creds_data.get("client_id"),
                            client_secret=creds_data.get("client_secret"),
                            scopes=SCOPES
                        )
                        # Set expiry if present
                        if "expiry" in creds_data:
                            from google.auth._helpers import parse_expiry
                            credentials.expiry = parse_expiry(creds_data["expiry"])
                    else:
                        raise
        except Exception as e:
            print(f"⚠️ Warning: Failed to load saved credentials: {e}")
            
    # If there are no valid credentials, run OAuth flow
    if not credentials or not credentials.valid:
        if credentials and credentials.expired and credentials.refresh_token:
            from google.auth.transport.requests import Request
            print("Refreshing access token...")
            try:
                credentials.refresh(Request())
            except Exception as e:
                print(f"⚠️ Token refresh failed: {e}. Re-authenticating...")
                credentials = None
                
        if not credentials:
            if not os.path.exists(CLIENT_SECRETS_FILE):
                sys.exit(f"❌ Error: client_secrets.json not found at {CLIENT_SECRETS_FILE}")
                
            print("Initiating YouTube OAuth flow...")
            print("Please open the link in your browser and authorize the application.")
            
            # Use InstalledAppFlow with the client_secrets.json
            flow = InstalledAppFlow.from_client_secrets_file(
                CLIENT_SECRETS_FILE, 
                scopes=SCOPES
            )
            
            # Force redirect_uri dynamically by trying different options registered in client_secrets.json
            try:
                # Generate auth URLs for the different possibilities
                flow.redirect_uri = 'http://localhost:8080/'
                auth_url_1, _ = flow.authorization_url(prompt='consent', access_type='offline')
                
                flow.redirect_uri = 'http://localhost:8080'
                auth_url_2, _ = flow.authorization_url(prompt='consent', access_type='offline')

                flow.redirect_uri = 'http://localhost:8081/'
                auth_url_3, _ = flow.authorization_url(prompt='consent', access_type='offline')
                
                flow.redirect_uri = 'http://localhost:8081'
                auth_url_4, _ = flow.authorization_url(prompt='consent', access_type='offline')

                flow.redirect_uri = 'https://ewpsepaieakqbywxnidu.supabase.co/auth/v1/callback'
                auth_url_5, _ = flow.authorization_url(prompt='consent', access_type='offline')
                
                print("\nLet's try different registered redirect URIs to bypass redirect_uri_mismatch:")
                print(f"\nOption 1 (http://localhost:8080/):\n   {auth_url_1}")
                print(f"\nOption 2 (http://localhost:8080):\n   {auth_url_2}")
                print(f"\nOption 3 (http://localhost:8081/):\n   {auth_url_3}")
                print(f"\nOption 4 (http://localhost:8081):\n   {auth_url_4}")
                print(f"\nOption 5 (Supabase Prod Callback):\n   {auth_url_5}")
                print("\nInstructions:")
                print("1. Try the options above in order. One of them will load the Google authorization page successfully.")
                print("2. Sign in and authorize the application.")
                print("3. Copy the entire URL of the page you are redirected to (even if it shows an error/blank page) and paste it below.")
                
                # Prompt user to input the redirect URL
                pasted_url = input("\n👉 Paste the redirect URL (or code) here: ").strip()
                
                # Detect redirect_uri used
                if "localhost:8080/" in pasted_url:
                    flow.redirect_uri = 'http://localhost:8080/'
                elif "localhost:8080" in pasted_url:
                    flow.redirect_uri = 'http://localhost:8080'
                elif "localhost:8081/" in pasted_url:
                    flow.redirect_uri = 'http://localhost:8081/'
                elif "localhost:8081" in pasted_url:
                    flow.redirect_uri = 'http://localhost:8081'
                elif "ewpsepaieakqbywxnidu.supabase.co" in pasted_url:
                    flow.redirect_uri = 'https://ewpsepaieakqbywxnidu.supabase.co/auth/v1/callback'
                else:
                    # Fallback to Option 1
                    flow.redirect_uri = 'http://localhost:8080/'
                    
                # Extract code parameter
                if "code=" in pasted_url:
                    from urllib.parse import urlparse, parse_qs
                    parsed = urlparse(pasted_url)
                    query = parse_qs(parsed.query)
                    code = query["code"][0]
                else:
                    code = pasted_url
                    
                print(f"Exchanging code for token (using redirect_uri: {flow.redirect_uri})...")
                flow.fetch_token(code=code)
                credentials = flow.credentials
            except Exception as ex:
                sys.exit(f"❌ Authentication failed: {ex}")
                
        # Save credentials for future runs
        try:
            with open(CREDENTIALS_FILE, 'w') as f:
                f.write(credentials.to_json())
            print(f"✓ Credentials saved to {CREDENTIALS_FILE}")
        except Exception as e:
            print(f"⚠️ Failed to save credentials: {e}")
            
    return build("youtube", "v3", credentials=credentials)

def upload_video(youtube, video_path, title, description, privacy_status="private"):
    if not os.path.exists(video_path):
        print(f"❌ Error: Video file does not exist: {video_path}")
        return False
        
    print(f"\n🚀 Preparing upload for: {video_path}")
    print(f"  Title: {title}")
    print(f"  Privacy: {privacy_status}")
    print(f"  Size: {os.path.getsize(video_path) / (1024*1024):.2f} MB")
    
    body = {
        "snippet": {
            "title": title,
            "description": description,
            "tags": ["AutaMedica", "Salud", "Telemedicina"],
            "categoryId": "22" # People & Blogs
        },
        "status": {
            "privacyStatus": privacy_status,
            "selfDeclaredMadeForKids": False
        }
    }
    
    # Use chunked upload (useful for large files like the 1.1 GB VOD)
    media = MediaFileUpload(
        video_path,
        mimetype="video/mp4",
        chunksize=1024 * 1024 * 5, # 5MB chunks
        resumable=True
    )
    
    request = youtube.videos().insert(
        part="snippet,status",
        body=body,
        media_body=media
    )
    
    print("\nUploading (please wait)...")
    response = None
    while response is None:
        status, response = request.next_chunk()
        if status:
            print(f"  Progress: {int(status.progress() * 100)}% completed", end="\r")
            sys.stdout.flush()
            
    print(f"\n🎉 Video uploaded successfully!")
    print(f"  YouTube Video ID: {response['id']}")
    print(f"  Video URL: https://youtu.be/{response['id']}")
    return response

def main():
    if len(sys.argv) < 3:
        print("Usage:")
        print("  python3 youtube_upload.py [video_path] [title] [description_file_or_text] [optional_privacy]")
        print("\nExample:")
        print("  python3 youtube_upload.py /path/to/video.mp4 \"My Video Title\" \"My Description\"")
        sys.exit(1)
        
    video_path = sys.argv[1]
    title = sys.argv[2]
    desc_arg = sys.argv[3]
    privacy = sys.argv[4] if len(sys.argv) > 4 else "private" # Default to private for safety
    
    # If description is a path to a file, read it
    if os.path.exists(desc_arg):
        with open(desc_arg, 'r', encoding='utf-8') as f:
            description = f.read()
    else:
        description = desc_arg
        
    try:
        youtube = get_authenticated_service()
        upload_video(youtube, video_path, title, description, privacy)
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
