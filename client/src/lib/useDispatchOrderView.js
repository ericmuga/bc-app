import {ref} from 'vue'
const key='dispatch-order-view'
function savedView(){try{return localStorage.getItem(key)==='list'?'list':'cards'}catch{return 'cards'}}
const orderView=ref(savedView())
export function useDispatchOrderView(){
 function setOrderView(value){orderView.value=value==='list'?'list':'cards';try{localStorage.setItem(key,orderView.value)}catch{/* View remains usable when storage is unavailable. */}}
 return {orderView,setOrderView}
}
