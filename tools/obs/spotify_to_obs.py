#!/usr/bin/env python3
import os
import sys
import time
import subprocess
import json
import urllib.parse

DIR_PATH = os.path.dirname(os.path.abspath(__file__))
FILE_PATH = os.path.join(DIR_PATH, "SpotifyCurrentSong.txt")

def get_spotify_status():
    try:
        # Get list of running players
        list_cmd = ["playerctl", "-l"]
        list_res = subprocess.run(list_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if list_res.returncode != 0:
            return "stopped", ""
            
        players = [p.strip() for p in list_res.stdout.strip().split("\n") if p.strip()]
        if not players:
            return "stopped", ""
            
        # Find the first player that is playing
        active_player = None
        for p in players:
            status_cmd = ["playerctl", "-p", p, "status"]
            status_res = subprocess.run(status_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if status_res.returncode == 0 and status_res.stdout.strip().lower() == "playing":
                active_player = p
                break
                
        # If no player is playing, check for paused players
        if not active_player:
            for p in players:
                status_cmd = ["playerctl", "-p", p, "status"]
                status_res = subprocess.run(status_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                if status_res.returncode == 0 and status_res.stdout.strip().lower() == "paused":
                    return "paused", ""
            return "stopped", ""
            
        # Fetch metadata formatted as JSON from the active playing player
        meta_cmd = ["playerctl", "-p", active_player, "metadata", "--format", '{"artist": "{{artist}}", "title": "{{title}}", "url": "{{xesam:url}}"}']
        meta_res = subprocess.run(meta_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if meta_res.returncode == 0:
            try:
                meta = json.loads(meta_res.stdout.strip())
                artist = meta.get("artist", "").strip()
                title = meta.get("title", "").strip()
                url = meta.get("url", "").strip()
                
                # Fallback for empty title or artist
                if not title and url:
                    # extract filename from URL path
                    parsed_url = urllib.parse.urlparse(url)
                    filename = os.path.basename(parsed_url.path)
                    if filename:
                        name_without_ext, _ = os.path.splitext(filename)
                        title = name_without_ext.replace("_", " ").replace("-", " ").title()
                
                # Format final track text
                if artist and title:
                    track = f"{artist} - {title}"
                elif artist:
                    track = artist
                elif title:
                    track = title
                else:
                    track = "Unknown Track"
                
                return "playing", track
            except Exception as e:
                pass
            
    except Exception as e:
        # If playerctl fails or is not available
        pass
    return "stopped", ""

def get_spotify_sink_index():
    try:
        res = subprocess.run(["pactl", "list", "sinks"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if res.returncode != 0:
            return None
        blocks = res.stdout.split("Sink #")
        for block in blocks[1:]:
            lines = block.split("\n")
            sink_id = lines[0].strip()
            for line in lines:
                if "Name: SpotifySink" in line:
                    return sink_id
    except:
        pass
    return None

def auto_redirect_audio(moved_inputs):
    spotify_sink_id = get_spotify_sink_index()
    if not spotify_sink_id:
        return
        
    try:
        res = subprocess.run(["pactl", "list", "sink-inputs"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if res.returncode != 0:
            return
            
        blocks = res.stdout.split("Sink Input #")
        for block in blocks[1:]:
            lines = block.split("\n")
            if not lines:
                continue
            input_id = lines[0].strip()
            
            app_name = ""
            current_sink = ""
            for line in lines:
                if "application.name =" in line:
                    app_name = line.split("=")[1].strip().strip('"')
                elif "application.process.binary =" in line:
                    app_binary = line.split("=")[1].strip().strip('"')
                    if not app_name:
                        app_name = app_binary
                elif "Sink:" in line:
                    current_sink = line.split(":")[1].strip()
            
            targets = ["Google Chrome", "chrome", "chromium", "Chromium", "spotify", "Spotify"]
            is_target = any(t in app_name for t in targets)
            
            if is_target and current_sink != spotify_sink_id:
                if input_id not in moved_inputs:
                    print(f"🔗 Auto-redirecting '{app_name}' (Input #{input_id}) to virtual sink 'SpotifySink' (Sink #{spotify_sink_id})")
                    subprocess.run(["pactl", "move-sink-input", input_id, "SpotifySink"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                    moved_inputs.add(input_id)
    except Exception as e:
        pass

def get_default_sink():
    try:
        res = subprocess.run(["pactl", "get-default-sink"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if res.returncode == 0:
            return res.stdout.strip()
    except:
        pass
    return "alsa_output.pci-0000_00_1f.3.analog-stereo"

def ensure_physical_loopback():
    default_sink = get_default_sink()
    if default_sink == "SpotifySink":
        return
        
    try:
        # Link SpotifySink:monitor to default physical sink:playback
        subprocess.run(["pw-link", "SpotifySink:monitor_FL", f"{default_sink}:playback_FL"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(["pw-link", "SpotifySink:monitor_FR", f"{default_sink}:playback_FR"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except:
        pass

def main():
    print("=====================================================")
    print("      🎧 AUTAMEDICA - SPOTIFY OBS CONNECTOR 🎧       ")
    print("=====================================================")
    print(f"Monitoring Spotify player status...")
    print(f"Currently playing song will be written to:")
    print(f"  {FILE_PATH}\n")
    print("Press Ctrl+C to terminate.")
    print("=====================================================")

    last_text = None
    moved_inputs = set()
    
    # Initialize/clear the file on start
    try:
        with open(FILE_PATH, "w", encoding="utf-8") as f:
            f.write("")
    except Exception as e:
        print(f"❌ Error initializing text file: {e}")

    try:
        while True:
            # Auto redirect audio input streams to virtual sink
            auto_redirect_audio(moved_inputs)
            
            # Ensure the virtual SpotifySink audio is output to physical speakers/headphones
            ensure_physical_loopback()
            
            status, track = get_spotify_status()
            
            if status == "playing" and track:
                text = f"»  {track}  "
            else:
                text = "" # Clears the file when paused/stopped so it disappears from the stream
                
            if text != last_text:
                try:
                    with open(FILE_PATH, "w", encoding="utf-8") as f:
                        f.write(text)
                    if text:
                        print(f"▶️ [Playing] {track}")
                    else:
                        print("⏸️ [Paused/Stopped] Cleared overlay text")
                    last_text = text
                except Exception as e:
                    print(f"❌ Error writing to file: {e}")
            
            time.sleep(2)
            
    except KeyboardInterrupt:
        print("\n👋 Exiting Spotify OBS Connector. Clearing file...")
        try:
            with open(FILE_PATH, "w", encoding="utf-8") as f:
                f.write("")
        except:
            pass
        print("Done!")

if __name__ == "__main__":
    main()
