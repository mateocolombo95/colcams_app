# Initial CCTV rules

These are placeholders for MVP validation and MUST be refined with real product data.

## NVR channels

Pick the smallest common NVR capacity that can support the camera count:

- 1–4 cameras → 4 channels
- 5–8 → 8 channels
- 9–16 → 16 channels
- 17–32 → 32 channels
- >32 → flag for manual design

Later:
- reserve spare channels
- manufacturer compatibility
- incoming bandwidth limit
- analytics limitations

## Storage

Initial estimation uses a simple bitrate model.

Approximate Mbps per camera by resolution:

- 2 MP → 2 Mbps
- 4 MP → 4 Mbps
- 5 MP → 5 Mbps
- 8 MP → 8 Mbps

Storage:

```text
GB = bitrate_Mbps × seconds_recorded × cameras / 8 / 1000
```

The engine then applies:
- retention days
- hours/day recording
- 15% safety factor
- next common disk capacity

This is deliberately conservative and should later support codec, FPS, VBR/CBR and motion recording.

## Cable

```text
estimated_cable =
    cameras × average_distance_per_camera × 1.15
```

Later, replace this when the site-plan cable path editor exists.

## PoE

MVP:
- 1 PoE port per wired PoE camera
- round to common switch sizes (4/8/16/24)

Later:
- actual PoE watt consumption
- PoE/PoE+/PoE++
- switch power budget
- uplink/SFP
- redundant switches

## Commercial

```text
sale_price = cost / (1 - margin)
```

Important: this treats margin as gross margin, not markup.

Example:
- cost = 100
- margin = 35%
- sale price = 153.85
