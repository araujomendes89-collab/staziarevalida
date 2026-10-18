// Microfone da conversa por voz do Tutor (voz ao vivo e modo reserva): eco cancelado (o professor sai pelo alto-falante do celular),
// supressão de ruído e ganho automático, um canal. Pedido UMA vez, no toque do aluno em "Começar" (Safari e iPhone exigem o gesto).
export const MIC_CONSTRAINTS = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } };
