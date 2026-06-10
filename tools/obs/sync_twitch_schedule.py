#!/usr/bin/env python3
import os
import urllib.request
import re
import json
from datetime import datetime, timezone

BROADCASTER_ID = "1374917529"
URL = f"https://api.twitch.tv/helix/schedule/icalendar?broadcaster_id={BROADCASTER_ID}"

DIR_PATH = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(DIR_PATH, "twitch_schedule.json")

def parse_ics(ical_text):
    events = []
    current_event = {}
    in_event = False
    
    for line in ical_text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line == "BEGIN:VEVENT":
            current_event = {}
            in_event = True
        elif line == "END:VEVENT":
            events.append(current_event)
            in_event = False
        elif in_event:
            if ":" in line:
                key_part, val = line.split(":", 1)
                # Parse TZID parameter if present
                key = key_part.split(";")[0]
                current_event[key] = val
                
                # Check for TZID property specifically
                if "TZID=" in key_part:
                    tz_match = re.search(r'TZID=([^;:]+)', key_part)
                    if tz_match:
                        current_event[f"{key}_TZID"] = tz_match.group(1)
                        
    return events

def main():
    try:
        print(f"Fetching Twitch iCalendar for Broadcaster ID: {BROADCASTER_ID}...")
        req = urllib.request.Request(
            URL, 
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        with urllib.request.urlopen(req) as response:
            ical_text = response.read().decode('utf-8')
            
        events = parse_ics(ical_text)
        
        parsed_schedule = {
            "broadcaster_id": BROADCASTER_ID,
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "events": []
        }
        
        for ev in events:
            # Clean up times and values
            start_time = ev.get("DTSTART", "")
            end_time = ev.get("DTEND", "")
            rrule = ev.get("RRULE", "")
            
            parsed_schedule["events"].append({
                "uid": ev.get("UID", ""),
                "start": start_time,
                "start_tz": ev.get("DTSTART_TZID", "UTC"),
                "end": end_time,
                "end_tz": ev.get("DTEND_TZID", "UTC"),
                "title": ev.get("SUMMARY", "").strip(),
                "description": ev.get("DESCRIPTION", "").strip(),
                "categories": [c.strip() for c in ev.get("CATEGORIES", "").split(",") if c.strip()],
                "recurrence": rrule
            })
            
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(parsed_schedule, f, indent=2, ensure_ascii=False)
            
        print(f"✅ Successfully synchronized schedule. Saved to: {OUTPUT_FILE}")
        print(json.dumps(parsed_schedule, indent=2, ensure_ascii=False))
        
    except Exception as e:
        print(f"❌ Error syncing schedule: {e}")

if __name__ == "__main__":
    main()
