#
# Copyright (C) 2026 Arthur97172 <arthur97172@outlook.com>
#
# This is free software, licensed under the GNU General Public License v3.0
# (SPDX: GPL-3.0-only).
#

PKG_NAME:=luci-app-corestatus
PKG_VERSION:=1.0.4
PKG_RELEASE:=1

PKG_LICENSE:=GPL-3.0-only
PKG_LICENSE_FILES:=LICENSE
PKG_MAINTAINER:=Arthur97172 <Arthur97172@users.noreply.github.com>

LUCI_URL:=https://github.com/Arthur97172/luci-app-corestatus
LUCI_MAINTAINER:=Arthur97172 <Arthur97172@users.noreply.github.com>

include $(TOPDIR)/rules.mk

LUCI_TITLE:=Core utilization and temperature info for the LuCI status page
LUCI_DEPENDS:=+ucode +ucode-mod-fs
LUCI_PKGARCH:=all

#include ../../luci.mk
include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
