"""Settings for the Delhi Night Activity Map pipeline.

Everything marked ASSUMPTION is our own guess, kept here so it can be tuned
without touching code. None of these numbers was measured or calibrated.
"""

OVERTURE_MIN_CONFIDENCE = 0.5      # ASSUMPTION (decision P3)

# Time bands (decision P1: three bands first). name, start hour, end hour; end < start wraps past midnight.
BANDS = [("day", 6, 18), ("evening", 18, 22), ("night", 22, 6)]

# Radii in metres used when attaching features to a street segment.
PLACE_RADIUS = 40        # ASSUMPTION: an open place within this distance puts people on the street
LAMP_RADIUS = 20         # ASSUMPTION
CCTV_RADIUS = 30         # ASSUMPTION
HELP_RADIUS = 250        # ASSUMPTION
TRANSIT_RADIUS = 200     # ASSUMPTION
SAMPLE_SPACING = 20      # metres between sample points along a segment

# Drop an Overture place when an OSM place of the same family is this close (treated as the same shop).
DEDUPE_CLOSE_M = 10
DEDUPE_NAME_M = 30       # ...or this close and the names share a word

# Likelihood that a place of this kind is open, per band (day, evening, night).
# ASSUMPTION: used only when a place has no parseable opening_hours. Shown as "estimated" everywhere.
PRIORS = {
    "pharmacy": (1.0, 0.9, 0.15),
    "hospital": (1.0, 1.0, 0.5),     # lowered from 1.0 after M1: the label also covers small nursing homes
    "clinic": (1.0, 0.6, 0.05),
    "atm": (1.0, 1.0, 0.5),
    "bank": (1.0, 0.1, 0.0),
    "restaurant": (0.9, 1.0, 0.2),
    "fast_food": (0.9, 1.0, 0.25),
    "cafe": (0.9, 0.9, 0.15),
    "bar": (0.3, 1.0, 0.5),
    "shop": (1.0, 0.8, 0.05),
    "convenience": (1.0, 0.9, 0.1),
    "fuel": (1.0, 1.0, 0.7),
    "hotel": (1.0, 1.0, 0.3),        # lowered from 1.0 after M1: hotels dominated the night signal
    "cinema": (1.0, 1.0, 0.4),
    "worship": (1.0, 0.7, 0.1),
    "market": (1.0, 0.8, 0.0),
    "police": (1.0, 1.0, 1.0),
}
HELP_KINDS = {"police", "hospital", "clinic", "pharmacy"}

# ASSUMPTION: a place labelled "hospital" whose name matches this is treated as a clinic (not open all night).
SMALL_MEDICAL_RE = r"nursing|clinic|polyclinic|maternity|dispensary|dental|eye |physio|diagnostic|centre for|center for"

# Transit open fractions per band (day, evening, night). ASSUMPTION; metro hours (about 05:30-23:30) not yet checked against DMRC.
METRO_OPEN = (1.0, 1.0, 0.15)
BUS_OPEN = (0.8, 0.6, 0.1)

WALKABLE = {
    "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link",
    "tertiary", "tertiary_link", "unclassified", "road", "residential", "living_street",
    "pedestrian", "corridor", "service", "cycleway", "footway", "steps", "path", "track",
    "bridleway",
}
MAIN_ROADS = {"trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link",
              "tertiary", "tertiary_link"}

# ---------- route scoring (M2). All ASSUMPTION: starting values to tune ----------
SCORE_WEIGHTS = {
    "open_places": 25, "gaps": 15, "help": 15, "main_road": 15,
    "transport": 10, "turns": 10, "cameras": 3,
}
F1_REF_PER_KM = 15.0        # expected-open places per km at which F1 reaches about 63% of its points
OPEN_THRESHOLD = 0.5        # a place counts as "open" for the gap measure at or above this probability
GAP_MIN_M = 150             # stretches longer than this without an open place count as a gap
HELP_WEIGHT = {"police": 2.0, "hospital": 1.0, "pharmacy": 1.0, "clinic": 0.5}
HELP_REF = 3.0              # raised from 1.0 after M2: help points saturated in Karol Bagh
METRO_MERGE_M = 100         # metro objects (entrances, platforms) within this distance count as one station
TRANSIT_REF = 1.5
BUS_WEIGHT = 0.3
TURN_ANGLE_DEG = 45
TURN_WINDOW_M = 15
TURNS_REF_PER_KM = 8
CCTV_REF_PER_KM = 3
WALK_M_PER_MIN = 80         # 4.8 km/h

# ---------- map details (display only, none of this changes a score) ----------
PROFILE_BIN_M = 100         # the activity strip and the route glow use bins this long
PROFILE_REF = 1.5           # expected-open places per bin at which a bin reads about 63% lively
# Landmarks drawn as icons: kind -> how far from the route (m) it is still listed.
POI_KINDS = ["police", "hospital", "pharmacy", "fuel", "atm"]
POI_RADIUS = {"police": 120, "hospital": 120, "pharmacy": 60, "fuel": 60, "atm": 40}
POI_METRO_RADIUS = 150     # a station pin is drawn only when an entrance is this close to the route
POI_MAX_PER_KIND = 14
POI_SPACING_M = 350         # keep one landmark of a kind per this much route, so icons do not pile up
STATION_NAME_M = 400        # a metro object this close to a named station takes its name

# Display only: a place labelled "hospital" whose name matches this (or SMALL_MEDICAL_RE) is not drawn as a hospital pin.
POI_NOT_HOSPITAL_RE = r"dentist|dental|doctor|\bdr\.? |physio|clinic|nursing|polyclinic|dispensary|diagnostic|eye |skin|ortho|cardiolog|\bcent(er|re)\b"
# "Help near me" lists only places whose name says hospital (the category also holds doctors, labs and eye clinics).
HELP_HOSPITAL_RE = r"hospital|aiims|medical (college|institute)|trauma"
