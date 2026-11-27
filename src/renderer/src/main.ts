import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import './styles/theme.css'
import App from './App.vue'
import RemoteWindow from './RemoteWindow.vue'

// ?remote=<serial> -> jendela remote mini yang selalu di atas
const isRemote = new URLSearchParams(location.search).has('remote')
createApp(isRemote ? RemoteWindow : App).use(createPinia()).mount('#app')
