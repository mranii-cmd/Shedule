export function snapshotCurrentSession(state) {
  const sessionName = state?. header?.session || 'defaut';
  
  try {
    return {
      seances: JSON.parse(JSON.stringify(state.seances || [])),
      nextSessionId: state.nextSessionId || 1,
      header: JSON.parse(JSON.stringify(state.header || { session: sessionName })),
      examens: JSON.parse(JSON.stringify(state.examens || [])),
      examRoomConfigs: JSON.parse(JSON. stringify(state.examRoomConfigs || [])),
      creneaux: JSON.parse(JSON.stringify(state.creneaux || {}))
    };
  } catch (e) {
    return {
      seances: state.seances || [],
      nextSessionId: state.nextSessionId || 1,
      header:  state.header || { session: sessionName },
      examens: state.examens || [],
      examRoomConfigs: state.examRoomConfigs || [],
      creneaux: state.creneaux || {}
    };
  }
}