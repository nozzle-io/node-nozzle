NOZZLE_DIR := deps/nozzle
PLOG_DIR := $(NOZZLE_DIR)/libs/plog/include
BUILD_DIR := .build
ADDON_DIR := build/Release
ADDON := $(ADDON_DIR)/nozzle_node.node

CXX ?= c++
AR ?= ar
NODE ?= node
NODE_INCLUDE_DIR ?= $(shell $(NODE) -p "require('path').resolve(require('path').dirname(process.execPath), '..', 'include', 'node')")

CXXFLAGS := -std=c++17 -fno-exceptions -fno-rtti -O2 -fPIC -DNAPI_VERSION=8

UNAME_S := $(shell uname -s)
ifeq ($(OS),Windows_NT)
	PLATFORM := windows
else ifeq ($(UNAME_S),Darwin)
	PLATFORM := macos
else
	PLATFORM := linux
endif

include $(NOZZLE_DIR)/sources/sources.mk

COMMON_SRCS := $(NOZZLE_COMMON_SRCS) $(NOZZLE_OPENGL_SRCS)

ifeq ($(PLATFORM),macos)
	CXXFLAGS += -DNOZZLE_PLATFORM_MACOS=1 -DNOZZLE_HAS_METAL=1 -DNOZZLE_HAS_OPENGL=1
	PLATFORM_SRCS := $(NOZZLE_MACOS_SRCS)
	ADDON_LDFLAGS := -bundle -undefined dynamic_lookup -framework Metal -framework IOSurface -framework Foundation -framework Accelerate -framework OpenGL -lobjc -lstdc++
endif

ifeq ($(PLATFORM),linux)
	CXXFLAGS += -DNOZZLE_PLATFORM_LINUX=1 -DNOZZLE_HAS_DMA_BUF=1 -DNOZZLE_HAS_OPENGL=1
	PLATFORM_SRCS := $(NOZZLE_LINUX_SRCS)
	ADDON_LDFLAGS := -shared -ldrm -lgbm -lEGL -lGL -lstdc++
endif

ifeq ($(PLATFORM),windows)
	$(error Windows build is not enabled in this initial package. Track #164 follow-up before claiming Windows support.)
endif

INCLUDES := -I$(NOZZLE_DIR)/include -I$(NOZZLE_DIR)/src -I$(PLOG_DIR) -I$(NODE_INCLUDE_DIR)
ifeq ($(PLATFORM),linux)
	INCLUDES += -I/usr/include/libdrm
endif

ALL_SRCS := $(COMMON_SRCS) $(PLATFORM_SRCS)
ALL_OBJS := $(patsubst %.cpp,$(BUILD_DIR)/%.o,$(patsubst %.mm,$(BUILD_DIR)/%.o,$(ALL_SRCS)))
LIB := $(BUILD_DIR)/libnozzle.a
ADDON_OBJS := $(BUILD_DIR)/src/native/nozzle_node.o

.PHONY: all clean

all: $(ADDON)

$(ADDON): $(LIB) $(ADDON_OBJS)
	@mkdir -p $(dir $@)
	$(CXX) -o $@ $(ADDON_OBJS) $(LIB) $(ADDON_LDFLAGS)

$(LIB): $(ALL_OBJS)
	@mkdir -p $(dir $@)
	$(AR) rcs $@ $^

$(BUILD_DIR)/%.o: %.cpp
	@mkdir -p $(dir $@)
	$(CXX) $(CXXFLAGS) $(INCLUDES) -c $< -o $@

$(BUILD_DIR)/%.o: %.mm
	@mkdir -p $(dir $@)
	$(CXX) $(CXXFLAGS) $(INCLUDES) -c $< -o $@

clean:
	rm -rf $(BUILD_DIR) build
