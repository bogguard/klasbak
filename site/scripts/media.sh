#!/usr/bin/env bash
# Makes the webinars' stills (their title cards) from the local recording (video/out, see
# video/README.md); shown behind the play button.
set -euo pipefail
cd "$(dirname "$0")/../.."
ffmpeg -v error -y -ss 4 -i video/out/webinar.mp4 -frames:v 1 -vf "scale=1280:-2" -q:v 3 site/src/img/webinar.jpg
ffmpeg -v error -y -ss 4 -i video/out/materiaal-webinar.mp4 -frames:v 1 -vf "scale=1280:-2" -q:v 3 site/src/img/materiaal-webinar.jpg
ls -lh site/src/img/webinar.jpg site/src/img/materiaal-webinar.jpg | awk '{print $5, $9}'
