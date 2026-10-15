import React from 'react';
import { Icon } from './Icon.jsx';
const T={brand:['#4DB2FF','#0A5FC4'],ai:['#A48BFA','#5A37D0'],info:['#6F93E8','#1E3F8A'],warning:['#FFCF6B','#E08E00'],pro:['#FFCF6B','#E08E00'],streak:['#FFA05C','#E5580F'],success:['#4FD39A','#0E8A5F'],danger:['#FF8A80','#C9302C'],neutral:['#AEB8C6','#5B6778'],navy:['#3A5CA2','#0D1C42'],clinica:['#6F93E8','#1E3F8A'],cirurgia:['#FFB15C','#D9650A'],go:['#F27BAA','#B8336F'],pediatria:['#4FD39A','#0E8A5F'],preventiva:['#A48BFA','#5A37D0']};
export function IconTile({name,tone='brand',size=40,radius}){
  const [a,b]=T[tone]||T.brand;const r=radius??Math.round(size*.3);
  return <span aria-hidden="true" style={{position:'relative',flex:'none',width:size,height:size,borderRadius:r,background:'linear-gradient(160deg,'+a+' 0%,'+b+' 100%)',boxShadow:'0 '+Math.round(size*.15)+'px '+Math.round(size*.3)+'px -'+Math.round(size*.15)+'px '+b+', inset 0 1px 0 rgba(255,255,255,.45), inset 0 -2px 4px rgba(0,0,0,.12)',display:'inline-flex',alignItems:'center',justifyContent:'center',color:'#fff',overflow:'hidden'}}>
    <span style={{position:'absolute',left:0,right:0,top:0,height:'50%',background:'linear-gradient(180deg,rgba(255,255,255,.32),rgba(255,255,255,0))'}}/>
    <Icon name={name} size={Math.round(size*.5)} style={{position:'relative',filter:'drop-shadow(0 1px 1px rgba(0,0,0,.25))'}}/>
  </span>;
}