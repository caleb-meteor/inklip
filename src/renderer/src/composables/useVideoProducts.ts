import { ref, computed } from 'vue'
import { useMessage } from 'naive-ui'
import { getDictsByTypeApi, createDictApi, deleteDictApi, updateDictApi, type DictItem } from '../api/dict'
import { addVideoCategoryApi, removeVideoCategoryApi } from '../api/video'

export function useVideoProducts() {
  const message = useMessage()
  const products = ref<DictItem[]>([])
  const activeProductId = ref<number | null>(null)

  const fetchProducts = async (): Promise<void> => {
    try {
      products.value = await getDictsByTypeApi('video_product')
    } catch (error) {
      console.error('Failed to fetch products', error)
    }
  }

  const createProduct = async (name: string): Promise<DictItem> => {
    try {
      const newProduct = await createDictApi(name, 'video_product')
      await fetchProducts()
      return newProduct
    } catch (error) {
      console.error('创建产品失败', error)
      message.error('创建产品失败，请重试')
      throw error
    }
  }

  const renameProduct = async (productId: number, newName: string): Promise<void> => {
    try {
      await updateDictApi(productId, newName)
      await fetchProducts()
    } catch (error) {
      console.error('重命名产品失败', error)
      message.error('重命名产品失败，请重试')
      throw error
    }
  }

  const deleteProduct = async (productId: number): Promise<void> => {
    try {
      await deleteDictApi(productId)
      await fetchProducts()
      if (activeProductId.value === productId) {
        activeProductId.value = null
      }
    } catch (error) {
      console.error('删除产品失败', error)
      message.error('删除产品失败，请重试')
      throw error
    }
  }

  const updateVideoProduct = async (videoId: number, productId: number | null, currentProductId?: number | null): Promise<void> => {
    try {
      // 如果已有产品，先删除
      if (currentProductId !== null && currentProductId !== undefined) {
        await removeVideoCategoryApi(videoId, currentProductId)
      }
      
      // 如果设置了新产品，添加
      if (productId !== null) {
        await addVideoCategoryApi(videoId, productId)
      }
    } catch (error) {
      console.error('设置产品失败', error)
      message.error('设置产品失败，请重试')
      throw error
    }
  }

  const getFileProduct = (file: { categories?: Array<{ id: number; name: string; type: string }> }): DictItem | null => {
    if (!file.categories) {
      return null
    }
    const productCategory = file.categories.find(cat => cat.type === 'video_product')
    if (!productCategory) {
      return null
    }
    return products.value.find(product => product.id === productCategory.id) || null
  }

  const currentProduct = computed(() => {
    if (activeProductId.value === null) {
      return null
    }
    return products.value.find(product => product.id === activeProductId.value) || null
  })

  return {
    products,
    activeProductId,
    currentProduct,
    fetchProducts,
    createProduct,
    renameProduct,
    deleteProduct,
    updateVideoProduct,
    getFileProduct
  }
}

