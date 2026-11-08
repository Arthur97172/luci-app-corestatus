# Load and Temperature (luci-app-corestatus)

English | [简体中文](README.md)

An OpenWrt / LuCI status plugin that shows CPU load, automatically discovers the load and frequency of the GPU, NPU (and other accelerators) present on the device, and displays the readings of the board, SoC and wireless temperature sensors. Hardware without a readable load counter shows only its frequency — the plugin never invents a percentage.

It adds two entry points:

- **Status → Overview**: a "Load and Temperature" widget on the overview page, refreshed every 5 seconds, showing total and per-CPU load plus GPU/NPU rows, with the temperature sensor block embedded below them.
- **Status → Realtime → Load and Temperature**: a load and temperature graph page sampled every 3 seconds; a switch at the top selects "Load" or "Temperature", with tabs for Total and each CPU or for each sensor, and current, average and peak values for the curves.

## Features

- **CPU**: reads `/proc/stat` and computes total load, per-core load and the user/nice/system/idle/io/irq/sirq breakdown; the CPU frequency is shown alongside them.
- **CPU frequency**: the live cpufreq value (`scaling_cur_freq` / `cpuinfo_cur_freq`) when cpufreq is available; on kernels where cpufreq fails to register (for example the Airoha AN7581) it falls back to the highest OPP in the device-tree CPU operating-points table.
- **Four overview views**: Load, Detailed load, Load of each CPU and Detailed load of each CPU. The choice is stored in the browser and restored on the next visit.
- **Automatic GPU / NPU discovery**: hardware is scanned at start-up and a row is shown only when the device exists; systems without a GPU/NPU show the CPU section alone, with no empty rows.
- **Load and frequency presented separately**: a progress bar is drawn when a load counter exists; otherwise only the frequency is shown (the device name is added when there are several devices of the same kind), with no empty bar and no "unavailable".
- **Automatic numbering for multiple devices**: for example `GPU 1` and `GPU 2`, each labelled "Load" or "Frequency" according to the data actually available.
- **Temperature sensors**: reads hwmon and thermal zones; the temperature block is embedded in the Load and Temperature widget, offers card, list, table and bar views with the same tab styling as the load view tabs, and colour-codes hot/overheat thresholds.
- **Overflowing tabs**: when the load or temperature tab bar does not fit on one line, ‹ / › buttons appear at both ends to step to the previous/next tab and scroll it into view; they stay hidden while every tab fits.
- **Read-only, no daemon**: all data is read through rpcd. The plugin writes no UCI configuration and starts no background service.

## Row labels

| Data available | Row label (English / Chinese) |
| --- | --- |
| CPU frequency (when readable) | CPU Frequency / CPU 频率 |
| Load (with or without frequency) | GPU Load / GPU 负载, NPU Load / NPU 负载 |
| Frequency only | GPU Frequency / GPU 频率, NPU Frequency / NPU 频率 |
| Neither load nor frequency | GPU, NPU (name only) |

## Supported accelerators

| Source | Typical platforms | Data read |
| --- | --- | --- |
| Standard devfreq | Most ARM SoCs including Rockchip, MediaTek and Allwinner | `load`, `gpu_load`, `utilisation`, `utilization`; frequency from `cur_freq` |
| Rockchip rknpu | Rockchip platforms with an NPU such as RK35xx | debugfs `/sys/kernel/debug/rknpu/load`; per-core percentages are averaged |
| Qualcomm Adreno | Qualcomm platforms | kgsl `gpu_busy_percentage`, or the busy/total pair in `gpubusy` |
| NVIDIA Tegra | Tegra series | `/sys/devices/platform/gpu.0/load` (0–1000) |
| AMD GPU | x86 and some ARM devices | `/sys/class/drm/card0/device/gpu_busy_percent` |
| Mali kbase / Utgard | Mali exposed as a misc device, e.g. on Samsung and Amlogic | `/sys/class/misc/mali0/device/utilization` and `clock` |
| Vendor NPUs exposed as misc devices | NPUs that publish a counter through a misc device | `utilization`, `utilisation`, `load`, `gpu_load`, `busy`; frequency from `clock`, `cur_freq`, `frequency` |
| Airoha AN7581 | Airoha/Econet AN7581 and similar | NPU presence plus debugfs `clk_rate`; there is no load counter, so the row reads "NPU Frequency" |

The generic devfreq and misc scans cover most ARM SoCs that expose their accelerators through standard sysfs interfaces. Platforms using private debugfs/sysfs interfaces need to be added to the probe list.

The parsers understand these load formats:

- plain percentages and `NN %`;
- a `busy total` counter pair (converted to a percentage);
- a 0–1000 per-mille scale;
- Rockchip's `12@800000000Hz`;
- Mali's `clock`, which may be either MHz (`600`) or Hz (`800000000`).

## Installation

### From Releases

1. Open the [Releases](https://github.com/Arthur97172/luci-app-corestatus/releases) page and download the package for your system.
2. Upload it to the device (for example into `/tmp`) and install it:

   **OpenWrt 24.10 and earlier (opkg)**

   ```sh
   opkg install /tmp/luci-app-corestatus_*.ipk

   # Optional Simplified Chinese language pack:
   opkg install /tmp/luci-i18n-corestatus-zh-cn_*.ipk
   ```

   **OpenWrt 25.12+ (apk)**

   ```sh
   apk add --allow-untrusted /tmp/luci-app-corestatus-*.apk

   # Optional Simplified Chinese language pack:
   apk add --allow-untrusted /tmp/luci-i18n-corestatus-zh-cn-*.apk
   ```

3. Reload LuCI: the temperature sensor block appears below the "Load and Temperature" widget on the overview page, and "Status → Realtime → Load and Temperature" gains a Load/Temperature switch.

> Temperature support depends on `ucode` and `ucode-mod-fs` (pulled in by the package; `rpcd-mod-ucode` is already a dependency of `luci-base`). Without the language pack the interface is English. The package architecture is `all`; it contains only front-end resources and works on ARM, x86, MIPS and other targets alike.
>
> This package uses its own `luci.corestatus` RPC script and ubus object, so it does not overwrite `luci-app-temp-status`; however, both may show temperature cards on the overview page, so install only one of them to avoid duplication.

### From source

```sh
cd openwrt
./scripts/feeds update -a
./scripts/feeds install -a
git clone https://github.com/Arthur97172/luci-app-corestatus.git package/luci-app-corestatus
make menuconfig     # LuCI → Applications → luci-app-corestatus
make package/luci-app-corestatus/compile V=s
```

The packages land in `bin/packages/<arch>/base/` and include both the plugin and the Simplified Chinese language pack.

### Deploy directly to a running device

For development, deploy the source tree to a device with SSH enabled instead of building packages:

```sh
scripts/deploy-router.sh root@192.168.10.224

# Password authentication (requires sshpass; pass the password via SSHPASS):
SSHPASS=your-password scripts/deploy-router.sh root@192.168.10.224
```

The script copies `root/` and `htdocs/`, installs the Simplified Chinese translation (requires `po2lmo`, or point `PO2LMO="node /path/to/po2lmo.mjs"` at a compiler), restarts rpcd, clears the LuCI caches and verifies the result. It is idempotent and can be re-run safely.

Some vendor firmware renders the overview from a fixed include list and never loads third-party includes; the script detects that layout and patches `/www/luci-static/resources/view/status/index.js` (the original is saved as `/root/luci-mod-status-status-index.js.bak`). Stock LuCI discovers includes automatically and needs no patch. Pass `--no-overview-patch` to skip it. A firmware upgrade reverts the patch; re-run the script afterwards.

## Usage

### Status overview

1. Open "Status → Overview" and find the "Load and Temperature" widget.
2. Below the widget title is a "Load" subheading, followed by the four view tabs: **Load**, **Detailed load**, **Load of each CPU** and **Detailed load of each CPU**. Click one to switch; the choice is remembered by the browser.
3. The first load needs two samples, so values read "Calculating..." briefly and appear after about 5 seconds.
4. A "CPU Frequency" row appears below the CPU table when a frequency can be read. When the device has a GPU/NPU, their rows follow it:
   - with a load counter: a progress bar, a percentage and a `name · frequency` detail line;
   - frequency only: "GPU Frequency" / "NPU Frequency" plus the frequency (with `name · frequency` when several devices of the same kind exist), and no progress bar;
   - neither: just the device name, labelled "GPU" / "NPU".
5. Devices without a GPU/NPU never show these rows; the CPU frequency row appears whenever it can be read.
6. The "Temperature" block at the bottom shows each sensor as a card by default; use the **Card view**, **List view**, **Table view** and **Bar view** tabs above it to switch views directly. They match the styling of the load view tabs above, and the bar view draws a progress bar scaled to each sensor's overheat threshold. The view choice is stored in the browser.

### Realtime status page

1. Open "Status → Realtime → Load and Temperature".
2. The switch at the top of the page toggles between **Load** and **Temperature**; the choice is stored in the browser.
3. "Load" has tabs for Total and each CPU, with current, average and peak values for the User, System, Sirq and Total curves.
4. "Temperature" has a tab per sensor, with current, minimum, average and peak values and the hot/overheat threshold lines.
5. When the sensor or CPU tabs do not fit in the tab bar, ‹ / › buttons appear at its left and right ends: they switch to the previous/next tab and scroll it into view, and are greyed out at the first and last tab. Both stay hidden while all tabs fit.
6. Both views share the same 3-second sampling; the chart window covers the last few minutes, which makes short spikes easy to see.

## How it works

- `view/status/include/18_corestatus.js` is the overview include; LuCI calls `load()` and re-renders it every 5 seconds. The temperature block comes from `corestatus/temperature-overview.js` and shares that render pass.
- `view/status/corestatus.js` is the realtime page; it composes `corestatus/load-graph.js` and `corestatus/temperature-graph.js`, which share a single 3-second poll. `corestatus/tab-nav.js` adds the previous/next buttons to both tab bars and scrolls the active tab into view when the tabs overflow.
- CPU load is computed from the difference between two consecutive `/proc/stat` samples, so it reports utilisation over an interval rather than an average since boot.
- The CPU frequency comes from `/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq`, then `cpuinfo_cur_freq` (both in kHz). When neither exists (cpufreq did not register), the plugin lists the `opp-<Hz>` nodes under `/sys/firmware/devicetree/base/opp-table` and uses the highest one; if that is unavailable too, the row is omitted.
- GPU/NPU discovery runs once on first load and is cached. If it found nothing, it is retried at most once a minute so hardware that appears late is not missed permanently.
- Every sysfs/procfs read goes through the rpcd `file` object, and the plugin lists the allowed paths in its `acl.d` file. rpcd resolves symlinks with `realpath()` before checking permissions, so the ACL grants both the `/sys/class/...` paths and their resolved `/sys/devices/...` targets.
- The scan order is: enumerate `/sys/class/devfreq`, try the dedicated Rockchip rknpu, Qualcomm kgsl, amdgpu, Tegra and Airoha probes, then scan `/sys/class/misc`. A misc entry that duplicates an accelerator already found is ignored.
- The device kind comes from name keywords: `npu`, `apu`, `vpu`, `nna` and `ethos` count as NPU; `gpu`, `mali`, `panfrost`, `adreno`, `kgsl`, `v3d`, `lima`, `vivante`, `galcore`, `sgpu`, `powervr`, `etnaviv` and `pvr` count as GPU.
- Temperature data comes from the bundled rpcd ucode script `root/usr/share/rpcd/ucode/luci.corestatus`: it registers the `luci.corestatus` ubus object, scans `/sys/class/hwmon` and `/sys/class/thermal`, and reads `tempN_input`, sensor labels and trip points. Inputs whose driver reports a non-zero `tempN_fault` are skipped. Thermal zones already covered by hwmon are de-duplicated.
- The script runs inside the rpcd process, is read-only and adds no daemon; because the reads happen inside rpcd, the temperature sysfs paths do not need individual ACL entries.
- The plugin writes no configuration and starts no daemon; uninstalling it leaves no system changes behind.

## Themes and compatibility

- Tested with `luci-theme-bootstrap` (the OpenWrt 24.10 / 25.12 default) and `luci-theme-argon` 2.x / 3.x.
- Light and dark modes follow the LuCI theme variables; no manual switch is required.
- The styles are scoped to this plugin's widget and do not affect other LuCI pages.

## Known limitations

- Only counters the kernel actually exposes can be shown. An NPU/GPU with no utilisation interface at all (for example the packet-forwarding NPU in Airoha AN7581) shows only its name and frequency.
- On x86, Intel integrated graphics and NVIDIA GPUs expose no readable sysfs load counter, and AMD GPUs are probed on `card0` only. Such systems show no GPU row; CPU frequency and temperatures still work.
- CPU frequency is read from the cpufreq policy cpu0 belongs to, so big.LITTLE systems show a single frequency value.
- Platforms that use a private sysfs/debugfs interface outside the current probe list are not detected; they need a probe path, parser and ACL entry.
- The rknpu load and the Airoha NPU frequency live in debugfs. When `/sys/kernel/debug` is not mounted those readings are missing (Airoha still shows its name, just without a frequency).
- The realtime page's load curves cover CPUs only; GPU/NPU information is shown in the status overview widget. Temperature curves live on the same page behind the Load/Temperature switch.
- The overview refresh interval is set by the LuCI status page (5 seconds) and is not configurable per plugin.
- When the kernel's cpufreq driver does not register (for example the AN7581's CPU clock reports no rate), "CPU Frequency" shows the highest device-tree OPP instead of a live value; such devices have no frequency-scaling interface to read anyway.
- Inputs the driver reports as faulted (for example an unconnected thermistor, which may read a sentinel value such as 127.9 °C) are skipped; other obviously bogus readings can be judged from the hot/overheat colouring.
- Temperature support requires `ucode-mod-fs`; on a minimal system without it the widget reports that no sensors are available.
- Argon 2.x's forced dark mode is implemented by a separate stylesheet and leaves no detectable marker on the page, so this plugin's small dark-background correction only applies under Bootstrap's `data-darkmode`. Argon 2.x styles both modes itself, so nothing is lost visually.

## File layout

```
.
├── Makefile
├── htdocs/luci-static/resources/
│   ├── svg/temperature.svg
│   ├── svg/corestatus.svg
│   ├── view/status/
│   │   ├── corestatus.js
│   │   └── include/
│   │       └── 18_corestatus.js
│   └── corestatus/
│       ├── load-graph.js
│       ├── tab-nav.js
│       ├── temperature-graph.js
│       └── temperature-overview.js
├── po/templates/corestatus.pot
├── po/zh_Hans/corestatus.po
├── root/usr/share/
│   ├── luci/menu.d/luci-app-corestatus.json
│   ├── rpcd/acl.d/luci-app-corestatus.json
│   └── rpcd/ucode/luci.corestatus
├── scripts/
│   ├── check.sh
│   ├── integration-check.js
│   └── integration-check.sh
└── .github/workflows/build.yml
```

## Requirements

- OpenWrt 24.10 or newer with LuCI (JavaScript views, `luci-base`)
- `rpcd` with the `file` object (shipped with OpenWrt) to read `/proc/stat` and sysfs
- `ucode` and `ucode-mod-fs` for the temperature RPC; `rpcd-mod-ucode` is a dependency of `luci-base`
- The Simplified Chinese language pack is optional
- debugfs mounted on the system to read rknpu load or Airoha NPU frequency

## Development and checks

The repository ships two layers of checks, run both locally and in CI:

```sh
scripts/check.sh              # static: JSON, JS syntax, menu/ACL cross-references, translations, naming
scripts/integration-check.sh  # behavioural: simulated sysfs drives discovery, parsing and rendering
```

The integration tests build sysfs trees for many platforms (Rockchip, Adreno, Tegra, Mali, Airoha and others) with Node.js; no real device is needed.

On every push to `main`, CI builds with the OpenWrt 24.10 SDK (ipk) and the 25.12 SDK (apk), then publishes both packages and the Chinese language pack to a GitHub Release tagged `v<PKG_VERSION>`.

## License

GPL-3.0-only.
