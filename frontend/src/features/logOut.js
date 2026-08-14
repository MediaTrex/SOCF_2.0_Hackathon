import { signOut } from 'firebase/auth'
import { auth } from '../../utils/firebase'
import api from '../../utils/axios'

async function logOut() {
  try {
    await api.get('/api/auth/logout')
  } catch (error) {
    console.log(error)
  }
  try {
    await signOut(auth)
  } catch (error) {
    console.log(error)
  }
}

export default logOut
