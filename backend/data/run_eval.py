import json
import requests
import time
import os

categories = [
    'helmet_present',
    'helmet_absent',
    'seatbelt_present',
    'seatbelt_absent',
    'pothole'
]

results = {}

print("Waiting for dataset download to finish...")
while True:
    try:
        res = requests.get('http://localhost:4000/api/vision/datasets')
        data = res.json()
        if data.get('totalImages', 0) >= 125:
            print("Dataset downloaded completely (125 images).")
            break
        print(f"Current images: {data.get('totalImages', 0)} / 125")
    except:
        pass
    time.sleep(2)

print("\n--- RUNNING EVALUATION ---")
for cat in categories:
    print(f"\nEvaluating category: {cat}")
    try:
        res = requests.post('http://localhost:4000/api/vision/evaluate', json={'datasetCategory': cat})
        data = res.json()
        results[cat] = data
        print(json.dumps(data, indent=2))
    except Exception as e:
        print(f"Error evaluating {cat}: {e}")

print("\n--- FINAL RAW OUTPUTS ---")
print(json.dumps(results, indent=2))

with open(r'c:\Users\Asus\OneDrive\Desktop\IIT MADRAS\backend\data\evaluation_results.json', 'w') as f:
    json.dump(results, f, indent=2)

