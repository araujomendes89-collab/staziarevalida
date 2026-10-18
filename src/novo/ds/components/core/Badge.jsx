import React from 'react';
import { Icon } from './Icon.jsx';
const TONES={neutral:['var(--surface-sunken)','var(--text-secondary)','var(--border-default)'],brand:['var(--surface-brand-soft)','var(--text-brand)','color-mix(in oklab,var(--border-brand) 35%,transparent)'],success:['var(--success-bg)','var(--success-text)','var(--success-border)'],warning:['var(--warning-bg)','var(--warning-text)','var(--warning-border)'],danger:['var(--danger-bg)','var(--danger-text)','var(--danger-border)'],info:['var(--info-bg)','var(--info-text)','var(--info-border)'],pro:['var(--pro-bg)','var(--pro-text)','var(--pro-border)'],ai:['var(--ai-bg)','var(--ai-text)','transparent'],streak:['var(--streak-bg)','var(--streak-text)','transparent'],solid:['var(--action-primary)','var(--action-on-primary)','transparent'],candidate:['var(--role-candidate-soft)','var(--role-candidate-ink)','transparent'],actor:['var(--role-actor-soft)','var(--role-actor-ink)','transparent']};
export function Badge({tone='neutral',size='md',caps=false,icon,children,style}){
  const [bg,fg,bd]=TONES[tone]||TONES.neutral;
  return <span className={['sm-badge',size==='sm'&&'sm-badge--sm',caps&&'sm-badge--caps'].filter(Boolean).join(' ')} style={{background:bg,color:fg,borderColor:bd,...style}}>
    {icon&&<Icon name={icon} size={size==='sm'?12:14}/>}{children}
  </span>;
}