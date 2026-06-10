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
                credentials = Credentials.from_authorized_user_info(creds_data, SCOPES)
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
            
            # Try running the local server on port 8080
            try:
                credentials = flow.run_local_server(port=8080, prompt='select_account')
            except Exception as e:
                print(f"⚠️ Port 8080 is in use ({e}). Falling back to manual authorization code entry.")
                try:
                    # Force redirect_uri to http://localhost:8080/ (which is registered in Google Console)
                    flow.redirect_uri = 'http://localhost:8080/'
                    auth_url, _ = flow.authorization_url(prompt='select_account', access_type='offline')
                    
                    print("\n1. Open the following URL in your browser to authorize the app:")
                    print(f"\n   {auth_url}\n")
                    print("2. Sign in and authorize the application.")
                    print("3. Your browser will redirect to http://localhost:8080/?code=...")
                    print("   (The page may show an error or remain blank, this is normal!)")
                    print("4. Copy the entire URL from the browser's address bar and paste it below.")
                    
                    # Prompt user to input the redirect URL
                    pasted_url = input("\n👉 Paste the redirect URL (or code) here: ").strip()
                    
                    # Extract code parameter
                    if "code=" in pasted_url:
                        from urllib.parse import urlparse, parse_qs
                        parsed = urlparse(pasted_url)
                        query = parse_qs(parsed.query)
                        code = query["code"][0]
                    else:
                        code = pasted_url
                        
                    print("Exchanging code for token...")
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
