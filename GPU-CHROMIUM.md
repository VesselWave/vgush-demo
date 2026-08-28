# Run Chromium with the NVIDIA Vulkan GPU

Launch Chromium with the NVIDIA Vulkan GPU and expose the Chrome DevTools Protocol on port 9333:

```bash
env DRI_PRIME=10de:28e0! chromium \
  --enable-features=Vulkan \
  --use-angle=vulkan \
  --ozone-platform=x11 \
  --remote-debugging-port=9333 \
  --user-data-dir=/tmp/gpu-chromium
```

In another terminal, connect `browse` to Chromium and open the local app:

```bash
browse open http://localhost:4000 --cdp 9333
```
