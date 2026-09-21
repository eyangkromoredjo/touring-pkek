import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyCc1YubWa4PRVPpaGCk8Wa1B2LnyLeycfk',
  authDomain: 'touring-pkek.firebaseapp.com',
  projectId: 'touring-pkek',
  storageBucket: 'touring-pkek.firebasestorage.app',
  messagingSenderId: '580355640106',
  appId: '1:580355640106:web:98976c069e34b99657ac53',
  measurementId: 'G-B5BTPP2NDT',
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
