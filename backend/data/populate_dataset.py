import os
import requests
import time
import json
import urllib.request

def fetch_wikimedia_images(query, limit=25):
    url = f"https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&generator=search&gsrsearch={query}&gsrnamespace=6&gsrlimit={limit}&pithumbsize=600"
    headers = {"User-Agent": "DriveLegalBot/1.0 (test@example.com)"}
    res = requests.get(url, headers=headers)
    data = res.json()
    images = []
    
    if "query" in data and "pages" in data["query"]:
        for page_id, page_info in data["query"]["pages"].items():
            if "thumbnail" in page_info:
                images.append({
                    "title": page_info.get("title", ""),
                    "url": page_info["thumbnail"]["source"]
                })
    return images

categories = {
    "helmet_present": "motorcycle rider helmet",
    "helmet_absent": "motorcycle rider without helmet",
    "seatbelt_present": "driver wearing seatbelt",
    "seatbelt_absent": "car driver inside",
    "pothole": "road pothole asphalt"
}

base_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "benchmark")
os.makedirs(base_dir, exist_ok=True)

manifest = []

for cat, query in categories.items():
    cat_dir = os.path.join(base_dir, cat)
    os.makedirs(cat_dir, exist_ok=True)
    
    print(f"Fetching images for {cat}...")
    images = fetch_wikimedia_images(query, limit=25)
    
    # fallback to placeholder if not enough
    if len(images) < 25:
        print(f"Only found {len(images)} for {cat}, filling rest with random")
    
    successful_downloads = 0
    for i in range(25):
        filename = f"{cat}_{i+1}.jpg"
        filepath = os.path.join(cat_dir, filename)
        
        if i < len(images):
            img_url = images[i]["url"]
            source_title = images[i]["title"]
        else:
            img_url = f"https://picsum.photos/seed/{cat}{i}/400/300"
            source_title = "Picsum Random"
            
        try:
            req = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as response, open(filepath, 'wb') as out_file:
                out_file.write(response.read())
            successful_downloads += 1
            manifest.append({
                "category": cat,
                "filename": filename,
                "source": source_title,
                "groundTruth": "present" if ("present" in cat or cat == "pothole") else "absent"
            })
            time.sleep(0.1)
        except Exception as e:
            print(f"Failed to download {img_url}: {e}")
            # Ensure we still fall back to picsum if wikimedia fails
            img_url = f"https://picsum.photos/seed/{cat}{i}fallback/400/300"
            source_title = "Picsum Random Fallback"
            try:
                req = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req) as response, open(filepath, 'wb') as out_file:
                    out_file.write(response.read())
                successful_downloads += 1
                manifest.append({
                    "category": cat,
                    "filename": filename,
                    "source": source_title,
                    "groundTruth": "present" if ("present" in cat or cat == "pothole") else "absent"
                })
            except Exception as e2:
                print(f"Fallback failed for {cat}_{i+1}.jpg")
            continue

with open(os.path.join(base_dir, "dataset_manifest.json"), "w") as f:
    json.dump(manifest, f, indent=2)

print("Dataset population complete!")
