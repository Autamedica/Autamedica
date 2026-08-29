#!/usr/bin/env python3
import sys
import os
import json
import re
import subprocess
from datetime import datetime, timedelta
from googleapiclient.discovery import build

def parse_relative_date(relative_str):
    now = datetime.now()
    relative_str = relative_str.lower().strip()
    
    if "hoy" in relative_str or "ahora" in relative_str or "justo ahora" in relative_str or "min" in relative_str:
        # Match minutes if present
        match = re.search(r'\d+', relative_str)
        if match:
            return now - timedelta(minutes=int(match.group()))
        return now
        
    match = re.search(r'\d+', relative_str)
    if not match:
        return now
        
    num = int(match.group())
    
    if "hora" in relative_str:
        return now - timedelta(hours=num)
    elif "día" in relative_str or "dia" in relative_str:
        return now - timedelta(days=num)
    elif "semana" in relative_str:
        return now - timedelta(weeks=num)
    elif "mes" in relative_str:
        return now - timedelta(days=num * 30)
    elif "año" in relative_str or "ano" in relative_str:
        return now - timedelta(days=num * 365)
        
    return now

def run_scraper_fallback(target_channel=None):
    print("\n⚠️ YouTube API read scopes are not available. Falling back to browser-based scraping...")
    script_dir = os.path.dirname(os.path.abspath(__file__))
    scraper_path = os.path.join(script_dir, "scrape_pub_dates.mjs")
    json_path = os.path.join(script_dir, "scraped_videos.json")
    
    print(f"🌐 Running browser scraper: {scraper_path}...")
    try:
        cmd = ["node", scraper_path, "--out", json_path]
        if target_channel:
            cmd.extend(["--channel", target_channel])
        subprocess.run(cmd, check=True)
    except Exception as e:
        sys.exit(f"❌ Failed to run scraper fallback: {e}")
        
    if not os.path.exists(json_path):
        sys.exit("❌ Scraped data file was not created.")
        
    with open(json_path, 'r', encoding='utf-8') as f:
        items = json.load(f)
        
    print(f"\n✅ Scraped {len(items)} items from YouTube channel.")
    
    videos = []
    for item in items:
        # Extract id from link or url
        url = item.get("url", "")
        video_id = ""
        if "/shorts/" in url:
            parts = url.split("/shorts/")
            if len(parts) > 1:
                video_id = parts[1].split("?")[0]
        elif "v=" in url:
            video_id = url.split("v=")[1].split("&")[0]
            
        date_str = item.get("date", "Desconocido")
        pub_date = parse_relative_date(date_str)
        
        videos.append({
            "id": video_id,
            "title": item.get("title", "Sin título"),
            "published_at": pub_date,
            "type": item.get("type", "Video"),
            "views": item.get("views", "0 views"),
            "relative_date": date_str
        })
        
    # Sort videos by published_at descending
    videos.sort(key=lambda x: x["published_at"], reverse=True)
    
    # 3. Analyze publication dates
    monthly_counts = {}
    for video in videos:
        pub_month = video["published_at"].strftime("%Y-%m (%B)")
        monthly_counts[pub_month] = monthly_counts.get(pub_month, 0) + 1
        
    print("\n📊 Video/Short publication count by month (approximated):")
    for month in sorted(monthly_counts.keys(), reverse=True):
        print(f"  - {month}: {monthly_counts[month]} items")
        
    # Group by day of week
    weekday_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    weekday_counts = {name: 0 for name in weekday_names}
    for video in videos:
        # Only analyze if we have a real relative date (not Desconocido)
        if video["relative_date"] != "Desconocido":
            day_name = weekday_names[video["published_at"].weekday()]
            weekday_counts[day_name] += 1
        
    print("\n📅 Publication count by day of week (recent items):")
    for day in weekday_names:
        print(f"  - {day}: {weekday_counts[day]} items")
        
    # Print the most recent 15 videos
    print("\n🆕 Most recent 15 items:")
    for i, video in enumerate(videos[:15], 1):
        print(f"  {i}. [{video['type']}] - {video['relative_date']} ({video['views']}) - {video['title']} (https://youtu.be/{video['id']})")

def get_api_client():
    CREDENTIALS_FILE = "/home/edu/.youtube-credentials.json"
    if not os.path.exists(CREDENTIALS_FILE):
        raise Exception("Credentials file not found.")
        
    with open(CREDENTIALS_FILE, 'r') as f:
        creds_data = json.load(f)
        
    saved_scopes = creds_data.get("scopes", [])
    required_scopes = ["https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/youtube"]
    if not any(scope in saved_scopes for scope in required_scopes):
        raise Exception("Credentials lack read permissions (youtube.readonly or youtube scope).")
        
    from google.oauth2.credentials import Credentials
    credentials = Credentials(
        token=creds_data["token"],
        refresh_token=creds_data.get("refresh_token"),
        token_uri=creds_data.get("token_uri"),
        client_id=creds_data.get("client_id"),
        client_secret=creds_data.get("client_secret"),
        scopes=saved_scopes
    )
    if "expiry" in creds_data:
        try:
            credentials.expiry = datetime.fromisoformat(creds_data["expiry"][:19])
        except Exception:
            pass
            
    return build("youtube", "v3", credentials=credentials)

def main():
    target_channel = None
    if len(sys.argv) > 1:
        target_channel = sys.argv[1]

    try:
        print("🔑 Checking saved YouTube credentials...")
        youtube = get_api_client()

        if target_channel:
            print(f"🔍 Fetching details for channel: {target_channel}...")
            if target_channel.startswith('UC'):
                ch_response = youtube.channels().list(
                    part="snippet,contentDetails",
                    id=target_channel
                ).execute()
            else:
                handle = target_channel if target_channel.startswith('@') else f"@{target_channel}"
                ch_response = youtube.channels().list(
                    part="snippet,contentDetails",
                    forHandle=handle
                ).execute()
        else:
            print("🔍 Fetching authenticated channel details...")
            ch_response = youtube.channels().list(
                part="snippet,contentDetails",
                mine=True
            ).execute()

        if not ch_response.get("items"):
            sys.exit(f"❌ No channel found for: {target_channel or 'authenticated user'}")
            
        channel = ch_response["items"][0]
        channel_id = channel["id"]
        channel_title = channel["snippet"]["title"]
        uploads_playlist_id = channel["contentDetails"]["relatedPlaylists"]["uploads"]
        
        if target_channel:
            print(f"✅ Channel found: {channel_title} ({channel_id})")
        else:
            print(f"✅ Authenticated as Channel: {channel_title} ({channel_id})")
        print(f"Uploads Playlist ID: {uploads_playlist_id}")
        
        # 2. Fetch all videos from the uploads playlist
        videos = []
        next_page_token = None
        
        print("📥 Fetching publication history from playlist items...")
        while True:
            playlist_response = youtube.playlistItems().list(
                part="snippet",
                playlistId=uploads_playlist_id,
                maxResults=50,
                pageToken=next_page_token
            ).execute()
            
            for item in playlist_response.get("items", []):
                snippet = item["snippet"]
                published_at_str = snippet["publishedAt"] # e.g. "2026-06-10T07:55:33Z"
                title = snippet["title"]
                video_id = snippet["resourceId"]["videoId"]
                
                # Parse date
                date_str = published_at_str.replace("Z", "+00:00")
                try:
                    pub_date = datetime.fromisoformat(date_str)
                except ValueError:
                    pub_date = datetime.strptime(published_at_str[:19], "%Y-%m-%dT%H:%M:%S")
                
                videos.append({
                    "id": video_id,
                    "title": title,
                    "published_at": pub_date
                })
                
            next_page_token = playlist_response.get("nextPageToken")
            if not next_page_token:
                break
                
        print(f"✅ Fetched {len(videos)} videos.")
        
        # 3. Analyze publication dates
        monthly_counts = {}
        for video in videos:
            pub_month = video["published_at"].strftime("%Y-%m (%B)")
            monthly_counts[pub_month] = monthly_counts.get(pub_month, 0) + 1
            
        print("\n📊 Video publication count by month:")
        for month in sorted(monthly_counts.keys(), reverse=True):
            print(f"  - {month}: {monthly_counts[month]} videos")
            
        # Group by day of week
        weekday_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        weekday_counts = {name: 0 for name in weekday_names}
        for video in videos:
            day_name = weekday_names[video["published_at"].weekday()]
            weekday_counts[day_name] += 1
            
        print("\n📅 Video publication count by day of week:")
        for day in weekday_names:
            print(f"  - {day}: {weekday_counts[day]} videos")
            
        # Group by hour of day (in UTC)
        hourly_counts = {i: 0 for i in range(24)}
        for video in videos:
            hourly_counts[video["published_at"].hour] += 1
            
        print("\n⏰ Video publication count by hour of day (UTC):")
        for hour in range(24):
            if hourly_counts[hour] > 0:
                print(f"  - {hour:02d}:00: {hourly_counts[hour]} videos")
 
        # Print the most recent 15 videos
        print("\n🆕 Most recent 15 videos:")
        for i, video in enumerate(videos[:15], 1):
            print(f"  {i}. {video['published_at'].strftime('%Y-%m-%d %H:%M:%S')} UTC - {video['title']} (https://youtu.be/{video['id']})")
            
    except Exception as e:
        print(f"⚠️ YouTube API query failed or credentials lack read permissions: {e}")
        run_scraper_fallback(target_channel)

if __name__ == "__main__":
    main()
