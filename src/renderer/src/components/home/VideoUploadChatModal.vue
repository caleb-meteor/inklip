<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal, NForm, NFormItem, NSelect, NButton, NIcon, NSpace, useMessage } from 'naive-ui'
import {
  CloudUploadOutline,
  FolderOutline,
  CloseOutline,
  DocumentTextOutline,
  VideocamOutline
} from '@vicons/ionicons5'
import { getDictsByTypeApi, createDictApi } from '../../api/dict'
import { uploadVideosBatchApi } from '../../api/video'

const MAX_VIDEOS_PER_PRODUCT = 6

interface Props {
  show: boolean
  preSelectedAnchor?: { id: number; name: string }
  preSelectedProduct?: { id: number; name: string }
  /** 从首页产品入口打开时，该产品当前已有视频数量，用于限制每个产品最多 6 个视频 */
  preSelectedProductVideoCount?: number
}

const props = defineProps<Props>()
const emit = defineEmits(['update:show', 'success'])

const message = useMessage()
const formRef = ref<any>(null)

const isUploading = ref(false)
const videoPaths = ref<string[]>([])
const subtitleFiles = ref<Record<string, string>>({})
const folderPath = ref('')

// Dictionary options
const anchorOptions = ref<{ label: string; value: string }[]>([])
const productOptions = ref<{ label: string; value: string }[]>([])
// Map name to ID for existing items
const nameToIdMap = ref<Record<string, number>>({})

const formValue = ref({
  anchor: null as string | null,
  product: null as string | null
})

const rules = {
  anchor: {
    required: true,
    message: '请选择或输入主播',
    trigger: ['blur', 'change']
  },
  product: {
    required: true,
    message: '请选择或输入产品',
    trigger: ['blur', 'change']
  }
}

const fetchDicts = async (): Promise<void> => {
  const anchors = await getDictsByTypeApi('video_anchor')
  const products = await getDictsByTypeApi('video_product')
  const newMap: Record<string, number> = {}
  anchorOptions.value = anchors.map((d) => {
    newMap[`anchor:${d.name}`] = d.id
    return { label: d.name, value: d.name }
  })
  productOptions.value = products.map((d) => {
    newMap[`product:${d.name}`] = d.id
    return { label: d.name, value: d.name }
  })
  nameToIdMap.value = newMap
}

watch(
  () => props.show,
  (val) => {
    if (val) {
      fetchDicts()
      // Don't clear formValue to remember last selection? Or clear?
      // User request: "引导用户输入...", probably fresh start is better or maybe minimal retention.
      // Let's keep it persistent if user closes and reopens, but maybe reset on success.
    }
  }
)

const handleSelectFile = async (): Promise<void> => {
  const result = await window.api.selectVideoFile()
  if (result.success && result.filePaths) {
    const newPaths = result.filePaths.filter((p) => !videoPaths.value.includes(p))
    videoPaths.value = [...videoPaths.value, ...newPaths]
    if (result.subtitleFiles) {
      subtitleFiles.value = { ...subtitleFiles.value, ...result.subtitleFiles }
    }
    folderPath.value = ''
  }
}

const handleSelectFolder = async (): Promise<void> => {
  const result = await window.api.selectVideoFolder()
  if (result.success) {
    if (result.videoFiles && result.videoFiles.length > 0) {
      videoPaths.value = result.videoFiles
      subtitleFiles.value = result.subtitleFiles || {}
      folderPath.value = result.folderPath || ''
      message.success(`已选择文件夹，包含 ${result.videoFiles.length} 个视频`)
    } else {
      message.warning('该文件夹中没有找到视频文件')
    }
  }
}

const removeFile = (index: number): void => {
  videoPaths.value.splice(index, 1)
  if (videoPaths.value.length === 0) {
    folderPath.value = ''
    subtitleFiles.value = {}
  }
}

const getDictId = async (name: string, type: 'anchor' | 'product'): Promise<number> => {
  const key = `${type}:${name}`
  if (nameToIdMap.value[key]) {
    return nameToIdMap.value[key]
  }

  const dictType = type === 'anchor' ? 'video_anchor' : 'video_product'
  const newDict = await createDictApi(name, dictType)
  nameToIdMap.value[key] = newDict.id
  return newDict.id
}

const handleConfirm = async (): Promise<void> => {
  if (videoPaths.value.length === 0) {
    message.warning('请先选择视频文件或文件夹')
    return
  }

  const currentCount = props.preSelectedProductVideoCount ?? 0
  if (props.preSelectedProduct && currentCount + videoPaths.value.length > MAX_VIDEOS_PER_PRODUCT) {
    message.warning(
      `每个产品下最多只能添加 ${MAX_VIDEOS_PER_PRODUCT} 个视频，当前已有 ${currentCount} 个`
    )
    return
  }

  isUploading.value = true
  let anchorId: number = 0
  let productId: number = 0

  if (props.preSelectedAnchor) anchorId = props.preSelectedAnchor.id
  else if (formValue.value.anchor) anchorId = await getDictId(formValue.value.anchor, 'anchor')

  if (props.preSelectedProduct) productId = props.preSelectedProduct.id
  else if (formValue.value.product) productId = await getDictId(formValue.value.product, 'product')

  const res = await uploadVideosBatchApi(videoPaths.value, subtitleFiles.value, anchorId, productId)
  let uploadedVideos: any[] = []
  if (Array.isArray(res)) uploadedVideos = res
  else if (res && Array.isArray(res.videos)) uploadedVideos = res.videos

  emit('success', uploadedVideos, {
    anchor: props.preSelectedAnchor ? props.preSelectedAnchor.name : formValue.value.anchor,
    product: props.preSelectedProduct ? props.preSelectedProduct.name : formValue.value.product
  })
  emit('update:show', false)
  videoPaths.value = []
  folderPath.value = ''
  subtitleFiles.value = {}
  formValue.value.anchor = null
  formValue.value.product = null
  isUploading.value = false
}

const handleClose = (): void => {
  if (!isUploading.value) {
    emit('update:show', false)
  }
}
</script>

<template>
  <n-modal
    :show="props.show"
    :mask-closable="!isUploading"
    :closable="!isUploading"
    preset="card"
    title="上传视频"
    style="width: 600px"
    @update:show="(val) => emit('update:show', val)"
    @close="handleClose"
  >
    <div class="upload-modal-content">
      <n-form
        v-if="false"
        ref="formRef"
        :model="formValue"
        :rules="rules"
        label-placement="left"
        label-width="80"
      >
        <n-form-item v-if="!props.preSelectedAnchor" label="主播" path="anchor">
          <n-select
            v-model:value="formValue.anchor"
            filterable
            tag
            placeholder="选择或输入主播姓名"
            :options="anchorOptions"
          />
        </n-form-item>

        <n-form-item v-if="!props.preSelectedProduct" label="产品" path="product">
          <n-select
            v-model:value="formValue.product"
            filterable
            tag
            placeholder="选择或输入产品名称"
            :options="productOptions"
          />
        </n-form-item>
      </n-form>

      <div class="file-selection-area">
        <div class="action-buttons">
          <n-space>
            <n-button :disabled="isUploading" @click="handleSelectFile">
              <template #icon
                ><n-icon><CloudUploadOutline /></n-icon
              ></template>
              选择文件
            </n-button>
            <n-button :disabled="isUploading" @click="handleSelectFolder">
              <template #icon
                ><n-icon><FolderOutline /></n-icon
              ></template>
              选择文件夹
            </n-button>
          </n-space>
        </div>

        <div v-if="folderPath" class="folder-info">
          <n-icon><FolderOutline /></n-icon>
          <span class="path-text">{{ folderPath }}</span>
          <span class="count-text">({{ videoPaths.length }} 个视频)</span>
        </div>

        <div v-if="videoPaths.length > 0" class="file-list">
          <div v-for="(path, index) in videoPaths" :key="index" class="file-item">
            <div class="file-content-col">
              <div class="file-row">
                <div class="file-icon">
                  <n-icon size="18"><VideocamOutline /></n-icon>
                </div>
                <div class="file-text" :title="path">{{ path.split('/').pop() }}</div>
              </div>
              <div v-if="subtitleFiles[path]" class="file-row subtitle-row">
                <div class="file-icon">
                  <n-icon size="16"><DocumentTextOutline /></n-icon>
                </div>
                <div class="file-text subtitle-text" :title="subtitleFiles[path]">
                  {{ subtitleFiles[path].split('/').pop() }}
                  <span class="sub-label">字幕</span>
                </div>
              </div>
            </div>
            <n-button
              quaternary
              circle
              size="small"
              class="file-action-btn"
              :disabled="isUploading"
              @click="removeFile(index)"
            >
              <template #icon
                ><n-icon><CloseOutline /></n-icon
              ></template>
            </n-button>
          </div>
        </div>
        <div v-else class="empty-hint">请选择视频文件或文件夹上传</div>
      </div>

      <div class="modal-footer">
        <n-button :disabled="isUploading" @click="handleClose">取消</n-button>
        <n-button type="primary" :loading="isUploading" @click="handleConfirm"> 开始上传 </n-button>
      </div>
    </div>
  </n-modal>
</template>

<style scoped>
.upload-modal-content {
  padding: 8px 0;
}

.file-selection-area {
  margin-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 20px;
}

.action-buttons {
  margin-bottom: 16px;
}

.folder-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  margin-bottom: 12px;
  font-size: 13px;
}

.path-text {
  font-family: monospace;
  opacity: 0.8;
  max-width: 350px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.file-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 13px;
}

.file-item:last-child {
  border-bottom: none;
}

.file-content-col {
  flex: 1;
  overflow: hidden;
  margin-right: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-row {
  display: flex;
  align-items: center;
  height: 20px;
}

.file-icon {
  margin-right: 8px;
  opacity: 0.7;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.file-action-btn {
  flex-shrink: 0;
  margin-left: 8px;
}

.file-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subtitle-text {
  font-size: 12px;
  color: #63e2b7;
  display: flex;
  align-items: center;
}

.sub-label {
  margin-left: 6px;
  font-size: 10px;
  opacity: 0.7;
  border: 1px solid currentColor;
  border-radius: 3px;
  padding: 0 4px;
  height: 14px;
  line-height: 12px;
  display: inline-block;
  white-space: nowrap;
}

.empty-hint {
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 13px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}
</style>
