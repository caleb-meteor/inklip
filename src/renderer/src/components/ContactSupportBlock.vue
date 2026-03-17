<script setup lang="ts">
/** 联系客服二维码图片地址 */
const CONTACT_QR_URL = 'https://inklip.caleb.center/contact.png'
</script>

<template>
  <div class="contact-support">
    <span class="contact-label">联系客服</span>
    <img :src="CONTACT_QR_URL" alt="联系客服" class="contact-qr" />
  </div>
</template>

<style scoped>
.contact-support {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 20px;
  border-top: 1px solid var(--n-border-color, rgba(255, 255, 255, 0.09));
  background: rgba(0, 0, 0, 0.15);
}

.contact-label {
  font-size: 13px;
  color: var(--n-text-color-2);
  margin-bottom: 8px;
}

.contact-qr {
  width: 120px;
  height: 120px;
  object-fit: contain;
  border-radius: 6px;
  background: #fff;
}
</style>
