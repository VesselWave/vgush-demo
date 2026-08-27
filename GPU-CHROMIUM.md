# Run Chromium with the Intel Vulkan GPU

Launch Chromium with the Intel Vulkan GPU and expose the Chrome DevTools Protocol on port 9333:

```bash
env DRI_PRIME=8086:a78b! chromium \
  --enable-features=Vulkan \
  --ozone-platform=x11 \
  --remote-debugging-port=9333 \
  --user-data-dir=/tmp/gpu-chromium
```

In another terminal, connect `browse` to Chromium and open the local app:

```bash
browse open http://localhost:4000 --cdp 9333
```
