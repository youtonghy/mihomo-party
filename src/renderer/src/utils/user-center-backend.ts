/**
 * User center backend management utilities
 */

import { useAppConfig } from '@renderer/hooks/use-app-config'

export interface BackendTestResult {
  id: string
  url: string
  name: string
  ping: number | null
  isActive: boolean
  error?: string
}

/**
 * Test latency for a single backend
 */
export const testBackendLatency = async (backend: IUserCenterBackend): Promise<BackendTestResult> => {
  const startTime = Date.now()
  
  try {
    const response = await fetch(`${backend.url}/api/v1/guest/comm/config`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000) // 10秒超时
    })
    
    const endTime = Date.now()
    const ping = endTime - startTime
    
    return {
      id: backend.id,
      url: backend.url,
      name: backend.name,
      ping: response.ok ? ping : null,
      isActive: response.ok,
      error: response.ok ? undefined : `HTTP ${response.status}`
    }
  } catch (error) {
    return {
      id: backend.id,
      url: backend.url,
      name: backend.name,
      ping: null,
      isActive: false,
      error: error instanceof Error ? error.message : '连接失败'
    }
  }
}

/**
 * Test latency for all backends
 */
export const testAllBackendsLatency = async (backends: IUserCenterBackend[]): Promise<BackendTestResult[]> => {
  const promises = backends.map(backend => testBackendLatency(backend))
  return Promise.all(promises)
}

/**
 * Get default backend from configuration
 */
export const getDefaultBackend = (appConfig?: IAppConfig): IUserCenterBackend => {
  const backends = appConfig?.userCenterBackends || []
  
  // Find explicitly marked default backend
  const defaultBackend = backends.find(backend => backend.isDefault)
  if (defaultBackend) {
    return defaultBackend
  }
  
  // Fall back to first backend
  if (backends.length > 0) {
    return backends[0]
  }
  
  // Fall back to legacy configuration or default
  const legacyUrl = appConfig?.userCenterLoginUrl || 'https://vpn.200461.xyz'
  return {
    id: 'default',
    name: '默认后端',
    url: legacyUrl,
    isDefault: true
  }
}

/**
 * Get all backends with fallback to legacy configuration
 */
export const getAllBackends = (appConfig?: IAppConfig): IUserCenterBackend[] => {
  const backends = appConfig?.userCenterBackends || []
  
  if (backends.length > 0) {
    return backends
  }
  
  // Fall back to legacy configuration
  const legacyUrl = appConfig?.userCenterLoginUrl || 'https://vpn.200461.xyz'
  return [{
    id: 'default',
    name: '默认后端',
    url: legacyUrl,
    isDefault: true
  }]
}

/**
 * Update backend configuration
 */
export const updateBackends = async (
  newBackends: IUserCenterBackend[],
  patchAppConfig: (config: Partial<IAppConfig>) => Promise<void>
): Promise<void> => {
  // Ensure at least one backend is marked as default
  if (!newBackends.some(backend => backend.isDefault) && newBackends.length > 0) {
    newBackends[0].isDefault = true
  }
  
  await patchAppConfig({ userCenterBackends: newBackends })
}

/**
 * Set default backend
 */
export const setDefaultBackend = async (
  backendId: string,
  patchAppConfig: (config: Partial<IAppConfig>) => Promise<void>,
  appConfig?: IAppConfig
): Promise<void> => {
  const backends = getAllBackends(appConfig)
  const updatedBackends = backends.map(backend => ({
    ...backend,
    isDefault: backend.id === backendId
  }))
  
  await updateBackends(updatedBackends, patchAppConfig)
}

/**
 * Add new backend
 */
export const addBackend = async (
  backend: Omit<IUserCenterBackend, 'id'>,
  patchAppConfig: (config: Partial<IAppConfig>) => Promise<void>,
  appConfig?: IAppConfig
): Promise<void> => {
  const existingBackends = getAllBackends(appConfig)
  const newBackend: IUserCenterBackend = {
    ...backend,
    id: Date.now().toString(),
    isDefault: existingBackends.length === 0 || backend.isDefault
  }
  
  // If this backend is set as default, unmark others
  const updatedBackends = existingBackends.map(b => ({
    ...b,
    isDefault: newBackend.isDefault ? false : b.isDefault
  }))
  
  updatedBackends.push(newBackend)
  await updateBackends(updatedBackends, patchAppConfig)
}

/**
 * Remove backend
 */
export const removeBackend = async (
  backendId: string,
  patchAppConfig: (config: Partial<IAppConfig>) => Promise<void>,
  appConfig?: IAppConfig
): Promise<void> => {
  const existingBackends = getAllBackends(appConfig)
  const updatedBackends = existingBackends.filter(backend => backend.id !== backendId)
  
  // If we removed the default backend, make the first remaining backend default
  const removedBackend = existingBackends.find(backend => backend.id === backendId)
  if (removedBackend?.isDefault && updatedBackends.length > 0) {
    updatedBackends[0].isDefault = true
  }
  
  await updateBackends(updatedBackends, patchAppConfig)
}

/**
 * Update backend ping results
 */
export const updateBackendPingResults = async (
  testResults: BackendTestResult[],
  patchAppConfig: (config: Partial<IAppConfig>) => Promise<void>,
  appConfig?: IAppConfig
): Promise<void> => {
  const existingBackends = getAllBackends(appConfig)
  const updatedBackends = existingBackends.map(backend => {
    const testResult = testResults.find(result => result.id === backend.id)
    if (testResult) {
      return {
        ...backend,
        lastPing: testResult.ping,
        lastTest: Date.now(),
        isActive: testResult.isActive
      }
    }
    return backend
  })
  
  await updateBackends(updatedBackends, patchAppConfig)
}

/**
 * Find backend with lowest ping value
 */
export const findOptimalBackend = (backends: IUserCenterBackend[]): IUserCenterBackend | null => {
  const backendsWithPing = backends.filter(backend => backend.lastPing && backend.isActive)
  
  if (backendsWithPing.length === 0) {
    return null
  }
  
  return backendsWithPing.reduce((optimal, current) => {
    if (!optimal.lastPing || !current.lastPing) {
      return optimal.lastPing ? optimal : current
    }
    return current.lastPing < optimal.lastPing ? current : optimal
  })
}

/**
 * Initialize default backends from legacy configuration
 */
export const initializeBackends = async (
  patchAppConfig: (config: Partial<IAppConfig>) => Promise<void>,
  appConfig?: IAppConfig
): Promise<void> => {
  const existingBackends = appConfig?.userCenterBackends || []
  
  // Check if we need to add the new panel server
  const hasPanelServer = existingBackends.some(backend => backend.id === 'panel')
  
  const legacyUrl = appConfig?.userCenterLoginUrl || 'https://vpn.200461.xyz'
  
  // If no backends exist, create default configuration
  if (existingBackends.length === 0) {
    const defaultBackends: IUserCenterBackend[] = [
      {
        id: 'default',
        name: '默认后端',
        url: legacyUrl,
        isDefault: true
      },
      {
        id: 'panel',
        name: '面板服务器',
        url: 'https://panel.200461.xyz',
        isDefault: false
      }
    ]
    
    await updateBackends(defaultBackends, patchAppConfig)
  } 
  // If backends exist but panel server is missing, add it
  else if (!hasPanelServer) {
    const updatedBackends = [...existingBackends, {
      id: 'panel',
      name: '面板服务器',
      url: 'https://panel.200461.xyz',
      isDefault: false
    }]
    
    await updateBackends(updatedBackends, patchAppConfig)
  }
}