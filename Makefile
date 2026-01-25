# Makefile for compressing resources directories
# 压缩 resources 目录下的各个平台文件夹

# Resources 目录路径
RESOURCES_DIR=resources

# 平台文件夹列表
PLATFORMS=win32-x64 darwin-x64 darwin-arm64

# 默认目标：压缩所有文件夹
.PHONY: all
all: compress-win32-x64 compress-darwin-x64 compress-darwin-arm64
	@echo "✅ 所有文件夹压缩完成！"
	@echo "压缩文件位于 $(RESOURCES_DIR)/ 目录"

# 压缩单个文件夹的通用规则
compress-%:
	@if [ -d "$(RESOURCES_DIR)/$*" ]; then \
		echo "📦 压缩 $(RESOURCES_DIR)/$* ..."; \
		cd $(RESOURCES_DIR) && zip -r $*.zip $*/ -x "*.DS_Store" "**/.DS_Store" && cd ..; \
		echo "✅ $(RESOURCES_DIR)/$*.zip 创建完成"; \
	else \
		echo "⚠️  文件夹 $(RESOURCES_DIR)/$* 不存在，跳过"; \
	fi

# 单独压缩各个平台
.PHONY: compress-win32-x64
compress-win32-x64:
	@if [ -d "$(RESOURCES_DIR)/win32-x64" ]; then \
		echo "📦 压缩 $(RESOURCES_DIR)/win32-x64 ..."; \
		cd $(RESOURCES_DIR) && zip -r win32-x64.zip win32-x64/ -x "*.DS_Store" "**/.DS_Store" && cd ..; \
		echo "✅ $(RESOURCES_DIR)/win32-x64.zip 创建完成"; \
	else \
		echo "⚠️  文件夹 $(RESOURCES_DIR)/win32-x64 不存在"; \
		exit 1; \
	fi

.PHONY: compress-darwin-x64
compress-darwin-x64:
	@if [ -d "$(RESOURCES_DIR)/darwin-x64" ]; then \
		echo "📦 压缩 $(RESOURCES_DIR)/darwin-x64 ..."; \
		cd $(RESOURCES_DIR) && zip -r darwin-x64.zip darwin-x64/ -x "*.DS_Store" "**/.DS_Store" && cd ..; \
		echo "✅ $(RESOURCES_DIR)/darwin-x64.zip 创建完成"; \
	else \
		echo "⚠️  文件夹 $(RESOURCES_DIR)/darwin-x64 不存在"; \
		exit 1; \
	fi

.PHONY: compress-darwin-arm64
compress-darwin-arm64:
	@if [ -d "$(RESOURCES_DIR)/darwin-arm64" ]; then \
		echo "📦 压缩 $(RESOURCES_DIR)/darwin-arm64 ..."; \
		cd $(RESOURCES_DIR) && zip -r darwin-arm64.zip darwin-arm64/ -x "*.DS_Store" "**/.DS_Store" && cd ..; \
		echo "✅ $(RESOURCES_DIR)/darwin-arm64.zip 创建完成"; \
	else \
		echo "⚠️  文件夹 $(RESOURCES_DIR)/darwin-arm64 不存在"; \
		exit 1; \
	fi

# 清理所有压缩文件
.PHONY: clean
clean:
	@echo "🧹 清理压缩文件..."
	@for platform in $(PLATFORMS); do \
		if [ -f "$(RESOURCES_DIR)/$$platform.zip" ]; then \
			rm -f "$(RESOURCES_DIR)/$$platform.zip"; \
			echo "  删除 $(RESOURCES_DIR)/$$platform.zip"; \
		fi; \
	done
	@echo "✅ 清理完成"

# 显示帮助信息
.PHONY: help
help:
	@echo "可用命令："
	@echo "  make all                  - 压缩所有平台文件夹 (win32-x64, darwin-x64, darwin-arm64)"
	@echo "  make compress-win32-x64   - 仅压缩 win32-x64 文件夹"
	@echo "  make compress-darwin-x64  - 仅压缩 darwin-x64 文件夹"
	@echo "  make compress-darwin-arm64 - 仅压缩 darwin-arm64 文件夹"
	@echo "  make clean                - 清理所有压缩文件"
	@echo "  make help                 - 显示此帮助信息"
	@echo ""
	@echo "压缩文件将输出到 $(RESOURCES_DIR)/ 目录："
	@echo "  - $(RESOURCES_DIR)/win32-x64.zip"
	@echo "  - $(RESOURCES_DIR)/darwin-x64.zip"
	@echo "  - $(RESOURCES_DIR)/darwin-arm64.zip"
