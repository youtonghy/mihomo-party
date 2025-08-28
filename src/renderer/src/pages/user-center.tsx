import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardBody, CardHeader, Input, Button, Modal, ModalContent, ModalHeader, ModalBody, Divider, Spinner, Progress, Select, SelectItem, Badge, Chip, Tooltip } from '@heroui/react'
import { useTranslation } from 'react-i18next'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { IoRefreshOutline, IoCloseOutline, IoPersonOutline, IoLockClosedOutline, IoServerOutline, IoSpeedometer, IoCheckmarkCircle, IoEyeOutline, IoEyeOffOutline } from 'react-icons/io5'
import BasePage from '@renderer/components/base/base-page'
import { 
  getAllBackends, 
  getDefaultBackend, 
  testAllBackendsLatency, 
  updateBackendPingResults, 
  setDefaultBackend, 
  initializeBackends,
  findOptimalBackend,
  BackendTestResult 
} from '@renderer/utils/user-center-backend'

interface UserInfo {
  email: string
  traffic: {
    upload: number
    download: number
    total: number
    expire: number | null
  }
}

interface Announcement {
  id: string
  title: string
  content: string
  date: string
  created_at?: string
  show?: number
}

interface LoadingState {
  userInfo: boolean
  announcements: boolean
}

interface ErrorState {
  userInfo: string | null
  announcements: string | null
}

interface NetworkStatus {
  isOnline: boolean
  lastConnected: Date | null
}

const UserCenter: React.FC = () => {
  const { t } = useTranslation()
  const { appConfig, patchAppConfig } = useAppConfig()
  const { refreshUserSubscription } = useProfileConfig()
  
  // Backend management
  const [backends, setBackends] = useState<IUserCenterBackend[]>([])
  const [selectedBackend, setSelectedBackend] = useState<IUserCenterBackend | null>(null)
  const [backendTestResults, setBackendTestResults] = useState<BackendTestResult[]>([])
  const [isTestingBackends, setIsTestingBackends] = useState(false)
  
  // Use selected backend URL or fallback to default
  const loginUrl = selectedBackend?.url || getDefaultBackend(appConfig).url
  
  // 状态管理
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  
  // 加载状态
  const [loading, setLoading] = useState<LoadingState>({
    userInfo: false,
    announcements: false
  })
  
  // 错误状态
  const [errors, setErrors] = useState<ErrorState>({
    userInfo: null,
    announcements: null
  })
  
  // 模态框状态
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  
  // 自动刷新相关
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const backendsRef = useRef<IUserCenterBackend[]>([])
  const hasStartedAutoTest = useRef<boolean>(false)
  
  // 网络状态
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    isOnline: navigator.onLine,
    lastConnected: navigator.onLine ? new Date() : null
  })
  
  // 服务器测试状态
  const [serverTestStatus, setServerTestStatus] = useState<{
    isLoading: boolean
    lastPing: number | null
    lastTest: Date | null
  }>({
    isLoading: false,
    lastPing: null,
    lastTest: null
  })
  
  // Token管理工具函数
  const tokenManager = {
    // 设置Token（带过期时间）
    setToken: (token: string, expiresInDays: number = 7) => {
      const now = new Date()
      const expiresAt = now.getTime() + (expiresInDays * 24 * 60 * 60 * 1000)
      
      const tokenData = {
        token,
        expiresAt,
        createdAt: now.getTime()
      }
      
      localStorage.setItem('userToken', token)
      localStorage.setItem('userTokenData', JSON.stringify(tokenData))
    },
    
    // 获取Token
    getToken: (): string | null => {
      const token = localStorage.getItem('userToken')
      const tokenDataStr = localStorage.getItem('userTokenData')
      
      if (!token || !tokenDataStr) {
        return null
      }
      
      try {
        const tokenData = JSON.parse(tokenDataStr)
        const now = Date.now()
        
        // 检查是否过期
        if (tokenData.expiresAt && now > tokenData.expiresAt) {
          tokenManager.clearToken()
          return null
        }
        
        return token
      } catch {
        // 数据格式错误，清除token
        tokenManager.clearToken()
        return null
      }
    },
    
    // 清除Token
    clearToken: () => {
      localStorage.removeItem('userToken')
      localStorage.removeItem('userTokenData')
      localStorage.removeItem('userEmail') // 清除记住的邮箱
    },
    
    // 检查Token是否即将过期（24小时内）
    isTokenExpiringSoon: (): boolean => {
      const tokenDataStr = localStorage.getItem('userTokenData')
      if (!tokenDataStr) return false
      
      try {
        const tokenData = JSON.parse(tokenDataStr)
        const now = Date.now()
        const oneDay = 24 * 60 * 60 * 1000
        
        return tokenData.expiresAt && (tokenData.expiresAt - now) < oneDay
      } catch {
        return false
      }
    },
    
    // 获取Token剩余天数
    getTokenRemainingDays: (): number => {
      const tokenDataStr = localStorage.getItem('userTokenData')
      if (!tokenDataStr) return 0
      
      try {
        const tokenData = JSON.parse(tokenDataStr)
        const now = Date.now()
        
        if (!tokenData.expiresAt || now > tokenData.expiresAt) {
          return 0
        }
        
        return Math.ceil((tokenData.expiresAt - now) / (24 * 60 * 60 * 1000))
      } catch {
        return 0
      }
    }
  }

  // 通用API请求函数（优化token处理）
  const apiRequest = useCallback(async (endpoint: string, options: RequestInit = {}) => {
    const token = tokenManager.getToken()
    if (!token) {
      setIsLoggedIn(false)
      return null
    }

    try {
      // 检查网络状态
      if (!navigator.onLine) {
        throw new Error('网络连接已断开')
      }

      const response = await fetch(`${loginUrl}${endpoint}`, {
        ...options,
        headers: {
          'Authorization': token, // 参考dashboard.html，直接使用token而不是Bearer格式
          'Content-Type': 'application/json',
          ...options.headers
        }
      })

      if (response.status === 401) {
        // Token无效或过期，清除并重新登录
        tokenManager.clearToken()
        setIsLoggedIn(false)
        return null
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      
      // API请求成功，更新网络状态
      setNetworkStatus({
        isOnline: true,
        lastConnected: new Date()
      })
      
      return data.data || data
    } catch (error) {
      // 检查是否是网络错误
      if (!navigator.onLine) {
        setNetworkStatus(prev => ({ ...prev, isOnline: false }))
      }
      
      console.error(`API request failed for ${endpoint}:`, error)
      throw error
    }
  }, [loginUrl])

  // 获取用户信息
  const fetchUserInfo = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(prev => ({ ...prev, userInfo: true }))
      setErrors(prev => ({ ...prev, userInfo: null }))
    }

    try {
      // 使用 getSubscribe 接口获取详细流量信息
      const data = await apiRequest('/api/v1/user/getSubscribe')
      
      if (data) {
        const newUserInfo: UserInfo = {
          email: data.email || 'user@example.com',
          traffic: {
            upload: Number(data.u) || 0,
            download: Number(data.d) || 0,
            total: Number(data.transfer_enable) || 0,
            expire: data.expired_at ? data.expired_at * 1000 : null
          }
        }
        setUserInfo(newUserInfo)
        setIsLoggedIn(true)
        setLastUpdate(new Date())
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '获取用户信息失败'
      setErrors(prev => ({ ...prev, userInfo: errorMessage }))
      
      // API失败时，仅在初次加载时使用模拟数据
      console.warn('用户信息加载失败，使用模拟数据:', error)
    } finally {
      setLoading(prev => ({ ...prev, userInfo: false }))
    }
  }, [apiRequest]) // 移除userInfo依赖，避免无限循环

  // 获取公告
  const fetchAnnouncements = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(prev => ({ ...prev, announcements: true }))
      setErrors(prev => ({ ...prev, announcements: null }))
    }

    try {
      const data = await apiRequest('/api/v1/user/notice/fetch')
      
      // 处理不同的响应格式
      let notices = []
      if (Array.isArray(data)) {
        notices = data
      } else if (data && Array.isArray(data.data)) {
        notices = data.data
      } else if (data && data.data && Array.isArray(data.data.list)) {
        notices = data.data.list
      }
      
      if (notices && notices.length > 0) {
        const filteredAnnouncements = notices
          .filter((notice: any) => notice.show !== 0)
          .map((notice: any) => ({
            id: String(notice.id || Math.random().toString(36).slice(2)),
            title: notice.title || '公告',
            content: notice.content || '',
            date: notice.created_at ? 
              new Date(notice.created_at * 1000).toLocaleDateString('zh-CN') :
              new Date().toLocaleDateString('zh-CN'),
            show: notice.show
          }))
          .sort((a: any, b: any) => {
            // 按日期降序排列（最新的在前）
            const dateA = new Date(a.date).getTime()
            const dateB = new Date(b.date).getTime()
            return dateB - dateA
          })
        setAnnouncements(filteredAnnouncements)
      } else {
        setAnnouncements([])
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '获取公告失败'
      setErrors(prev => ({ ...prev, announcements: errorMessage }))
      
      // API失败时，仅在初次加载时使用模拟数据
      console.warn('公告加载失败，使用模拟数据:', error)
    } finally {
      setLoading(prev => ({ ...prev, announcements: false }))
    }
  }, [apiRequest])

  // 统一刷新所有数据（仅在初始化时使用）
  const refreshAllData = useCallback(async (showLoading = false) => {
    if (!isLoggedIn) return
    
    await Promise.all([
      fetchUserInfo(showLoading),
      fetchAnnouncements(showLoading)
    ])
  }, [isLoggedIn, fetchUserInfo, fetchAnnouncements])

  // 服务器连接测试
  const testServerConnection = useCallback(async () => {
    setServerTestStatus(prev => ({ ...prev, isLoading: true }))
    
    try {
      const startTime = Date.now()
      const response = await fetch(`${loginUrl}/api/v1/guest/comm/config`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000) // 10秒超时
      })
      const endTime = Date.now()
      const ping = endTime - startTime
      
      setServerTestStatus({
        isLoading: false,
        lastPing: ping,
        lastTest: new Date()
      })
      
      if (response.ok) {
        setNetworkStatus({
          isOnline: true,
          lastConnected: new Date()
        })
        setErrors(prev => ({ ...prev, userInfo: null }))
      } else {
        throw new Error(`服务器响应异常 (${response.status})`)
      }
    } catch (error) {
      setServerTestStatus(prev => ({
        ...prev,
        isLoading: false,
        lastTest: new Date()
      }))
      
      let errorMsg = '服务器连接失败'
      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.message.includes('timeout')) {
          errorMsg = '服务器响应超时'
        } else if (error.message.includes('fetch')) {
          errorMsg = '网络连接错误'
        } else {
          errorMsg = error.message
        }
      }
      
      setErrors(prev => ({ 
        ...prev, 
        userInfo: `服务器测试失败: ${errorMsg}` 
      }))
      
      setNetworkStatus(prev => ({ ...prev, isOnline: false }))
    }
  }, [loginUrl])

  // Backend management functions
  const initializeBackendList = useCallback(async () => {
    try {
      await initializeBackends(patchAppConfig, appConfig)
      const availableBackends = getAllBackends(appConfig)
      setBackends(availableBackends)
      backendsRef.current = availableBackends // 更新 ref
      
      const defaultBackend = getDefaultBackend(appConfig)
      setSelectedBackend(defaultBackend)
    } catch (error) {
      console.error('Failed to initialize backends:', error)
    }
  }, [appConfig, patchAppConfig])

  const testAllBackends = useCallback(async () => {
    const currentBackends = backendsRef.current
    if (currentBackends.length === 0) return
    
    setIsTestingBackends(true)
    try {
      const results = await testAllBackendsLatency(currentBackends)
      setBackendTestResults(results)
      
      // Update backend ping results in configuration
      await updateBackendPingResults(results, patchAppConfig, appConfig)
      
      // Update local backend list
      const updatedBackends = getAllBackends(appConfig)
      setBackends(updatedBackends)
      backendsRef.current = updatedBackends // 更新 ref
      
      return results
    } catch (error) {
      console.error('Backend testing failed:', error)
      return []
    } finally {
      setIsTestingBackends(false)
    }
  }, [patchAppConfig, appConfig])

  const testAllBackendsAndSelectOptimal = useCallback(async () => {
    const currentBackends = backendsRef.current
    if (currentBackends.length <= 1) return
    
    setIsTestingBackends(true)
    try {
      const results = await testAllBackendsLatency(currentBackends)
      setBackendTestResults(results)
      
      // Update backend ping results in configuration
      await updateBackendPingResults(results, patchAppConfig, appConfig)
      
      // Get updated backends with ping results
      const updatedBackends = getAllBackends(appConfig)
      setBackends(updatedBackends)
      backendsRef.current = updatedBackends // 更新 ref
      
      // Find optimal backend and auto-select it
      const optimalBackend = findOptimalBackend(updatedBackends)
      if (optimalBackend && optimalBackend.id !== selectedBackend?.id) {
        await setDefaultBackend(optimalBackend.id, patchAppConfig, appConfig)
        const finalBackends = getAllBackends(appConfig)
        setBackends(finalBackends)
        backendsRef.current = finalBackends // 更新 ref
        
        const newDefaultBackend = getDefaultBackend(appConfig)
        setSelectedBackend(newDefaultBackend)
        
        console.log(`Auto-selected optimal backend: ${optimalBackend.name} (${optimalBackend.lastPing}ms)`)
      }
      
      return results
    } catch (error) {
      console.error('Backend testing and selection failed:', error)
      return []
    } finally {
      setIsTestingBackends(false)
    }
  }, [patchAppConfig, appConfig, selectedBackend])

  const handleBackendSelection = useCallback(async (backendId: string) => {
    try {
      await setDefaultBackend(backendId, patchAppConfig, appConfig)
      const updatedBackends = getAllBackends(appConfig)
      setBackends(updatedBackends)
      
      const newDefaultBackend = getDefaultBackend(appConfig)
      setSelectedBackend(newDefaultBackend)
    } catch (error) {
      console.error('Failed to set default backend:', error)
    }
  }, [patchAppConfig, appConfig])

  const getBackendStatusColor = (backend: IUserCenterBackend): 'success' | 'warning' | 'danger' | 'default' => {
    if (!backend.lastPing) return 'default'
    if (backend.lastPing < 300) return 'success'
    if (backend.lastPing < 1000) return 'warning'
    return 'danger'
  }

  const getBackendStatusText = (backend: IUserCenterBackend): string => {
    if (!backend.lastPing) return '未测试'
    if (backend.lastPing < 100) return `极快 (${backend.lastPing}ms)`
    if (backend.lastPing < 300) return `很快 (${backend.lastPing}ms)`
    if (backend.lastPing < 1000) return `良好 (${backend.lastPing}ms)`
    return `较慢 (${backend.lastPing}ms)`
  }

  // 登录处理
  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setErrors(prev => ({ ...prev, userInfo: '请填写完整的邮箱和密码' }))
      return
    }
    
    // 简单的邮箱格式验证
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      setErrors(prev => ({ ...prev, userInfo: '请输入正确的邮箱格式' }))
      return
    }
    
    // 检查网络状态
    if (!navigator.onLine) {
      setErrors(prev => ({ ...prev, userInfo: '网络连接已断开，请检查网络后重试' }))
      return
    }
    
    setLoading(prev => ({ ...prev, userInfo: true }))
    setErrors(prev => ({ ...prev, userInfo: null }))
    
    try {
      // 参考login.html的API调用方式
      const response = await fetch(`${loginUrl}/api/v1/passport/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          email: email.trim(),
          password: password
        })
      })
      
      // 检查响应状态
      if (!response.ok) {
        let errorMessage = '登录失败'
        
        switch (response.status) {
          case 400:
            errorMessage = '请求参数错误，请检查邮箱和密码格式'
            break
          case 401:
            errorMessage = '邮箱或密码错误，请重新输入'
            break
          case 403:
            errorMessage = '账户已被禁用，请联系管理员'
            break
          case 429:
            errorMessage = '登录尝试过于频繁，请稍后重试'
            break
          case 500:
          case 502:
          case 503:
          case 504:
            errorMessage = '服务器暂时无法访问，请稍后重试'
            break
          default:
            errorMessage = `服务器错误 (${response.status})`
        }
        
        throw new Error(errorMessage)
      }
      
      const data = await response.json()
      
      if (data.data && data.data.auth_data) {
        // 登录成功，使用token管理器保存token（7天有效期）
        tokenManager.setToken(data.data.auth_data, 7)
        
        // 保存用户邮箱以便下次自动填入
        localStorage.setItem('userEmail', email.trim())
        
        setIsLoggedIn(true)
        setErrors(prev => ({ ...prev, userInfo: null }))
        
        // 更新网络状态
        setNetworkStatus({
          isOnline: true,
          lastConnected: new Date()
        })
        
        // 并行加载用户数据
        try {
          await Promise.all([
            fetchUserInfo(),
            fetchAnnouncements(),
            refreshUserSubscription() // 刷新用户订阅链接
          ])
        } catch (dataError) {
          // 即使数据加载失败，登录仍然成功
          console.warn('Initial data loading failed:', dataError)
        }
        
      } else {
        // API返回成功但数据格式不正确
        throw new Error(data.message || '登录响应数据格式错误')
      }
    } catch (error) {
      let errorMessage = '登录失败，请稍后重试'
      
      if (error instanceof TypeError && error.message.includes('fetch')) {
        // 网络连接错误
        errorMessage = '无法连接到服务器，请检查网络连接和服务器地址'
        setNetworkStatus(prev => ({ ...prev, isOnline: false }))
      } else if (!navigator.onLine) {
        // 网络已断开
        errorMessage = '网络连接已断开'
        setNetworkStatus(prev => ({ ...prev, isOnline: false }))
      } else if (error instanceof Error) {
        // 使用具体的错误信息
        errorMessage = error.message
      }
      
      setErrors(prev => ({ ...prev, userInfo: errorMessage }))
      
      // 记录错误用于调试
      console.error('Login failed:', {
        error,
        email: email.trim(),
        loginUrl,
        timestamp: new Date().toISOString()
      })
    } finally {
      setLoading(prev => ({ ...prev, userInfo: false }))
    }
  }

  // 退出登录
  const handleLogout = () => {
    tokenManager.clearToken()
    setIsLoggedIn(false)
    setUserInfo(null)
    setAnnouncements([])
    setEmail('')
    setPassword('')
    
    // 重置自动测试标志
    hasStartedAutoTest.current = false
    
    // 清理定时器
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    
    // 清理错误状态
    setErrors({
      userInfo: null,
      announcements: null
    })
    
    // 刷新用户订阅为空白状态，并更新订阅内容为默认空白配置
    refreshUserSubscription().then(async () => {
      try {
        // 获取用户订阅项ID
        const USER_SUBSCRIPTION_ID = 'user-subscription-meta'

        // 关键修复：将订阅项在配置中改为“空白占位”URL并禁用自动更新，避免重启后被重新拉取
        // 说明：主进程 profileUpdater 在 URL 为 'https://example.com/empty-subscription' 或 interval 为 0 时都不会触发更新
        try {
          const currentItem = await window.electron.ipcRenderer.invoke('getProfileItem', USER_SUBSCRIPTION_ID)
          if (currentItem) {
            const patchedItem = {
              ...currentItem,
              url: 'https://example.com/empty-subscription',
              interval: 0,
              extra: undefined
            }
            await window.electron.ipcRenderer.invoke('updateProfileItem', patchedItem)
          }
        } catch (e) {
          console.warn('更新用户订阅占位状态失败（将继续清理本地文件）:', e)
        }

        // 同步将本地配置文件重置为空白（即使随后删除文件，也可立即生效为干净配置）
        await window.electron.ipcRenderer.invoke('setProfileStr', USER_SUBSCRIPTION_ID, `# 空白订阅配置
# 退出登录后的默认配置，包含基本结构但无具体代理内容

proxies:
  # 无代理配置

proxy-groups:
  # 无代理组配置

rules:
  # 无规则配置
  - MATCH,DIRECT
`)
        
        // 强制删除AppData中的用户订阅文件
        try {
          await window.electron.ipcRenderer.invoke('removeProfileFile', USER_SUBSCRIPTION_ID)
          console.log('AppData中的用户订阅文件已删除')
        } catch (fileError) {
          console.warn('删除AppData中的用户订阅文件失败:', fileError)
        }

        console.log('用户订阅内容已清空为默认配置')
      } catch (error) {
        console.error('清空用户订阅内容失败:', error)
      }
    }).catch(console.error)
  }

  // 初始化
  useEffect(() => {
    // Initialize backend list
    initializeBackendList()
    
    // 检查并加载保存的token
    const token = tokenManager.getToken()
    if (token) {
      setIsLoggedIn(true)
      fetchUserInfo()
      fetchAnnouncements()
    } else {
      // 未登录状态，自动测试服务器连接
      testServerConnection()
    }
    
    // 自动填充上次登录的邮箱
    const savedEmail = localStorage.getItem('userEmail')
    if (savedEmail && !email) {
      setEmail(savedEmail)
    }
  }, [fetchUserInfo, fetchAnnouncements, testServerConnection, initializeBackendList])

  // Sync backendsRef with backends state
  useEffect(() => {
    backendsRef.current = backends
  }, [backends])

  // Auto-test backends after initialization and every 10 seconds
  useEffect(() => {
    if (!isLoggedIn && backends.length > 0 && !hasStartedAutoTest.current) {
      hasStartedAutoTest.current = true
      console.log('Starting auto-test for backends...') // 调试信息
      
      // Clear any existing timers
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      
      // Initial test after 1 second
      const initialTimer = setTimeout(() => {
        console.log('Initial backend test after 1 second...') // 调试信息
        const currentBackends = backendsRef.current
        if (currentBackends.length > 1) {
          testAllBackendsAndSelectOptimal()
        } else if (currentBackends.length === 1) {
          testAllBackends()
        }
      }, 1000)
      
      // Then test every 10 seconds
      intervalRef.current = setInterval(() => {
        console.log('Auto-testing backends every 10 seconds...') // 调试信息
        const currentBackends = backendsRef.current
        if (currentBackends.length > 1) {
          testAllBackendsAndSelectOptimal()
        } else if (currentBackends.length === 1) {
          testAllBackends()
        }
      }, 10000) // 10 seconds
      
      return () => {
        clearTimeout(initialTimer)
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    }
    
    // Reset when user logs in
    if (isLoggedIn) {
      hasStartedAutoTest.current = false
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isLoggedIn, backends.length]) // 依赖于登录状态和后端数量

  // Token过期检查和提醒
  useEffect(() => {
    if (!isLoggedIn) return

    const checkTokenExpiration = () => {
      if (tokenManager.isTokenExpiringSoon()) {
        const remainingDays = tokenManager.getTokenRemainingDays()
        if (remainingDays > 0) {
          setErrors(prev => ({ 
            ...prev, 
            userInfo: `登录将在${remainingDays}天后过期，请及时重新登录` 
          }))
        }
      }
    }

    // 立即检查一次
    checkTokenExpiration()
    
    // 每小时检查一次
    const tokenCheckInterval = setInterval(checkTokenExpiration, 60 * 60 * 1000)
    
    return () => {
      clearInterval(tokenCheckInterval)
    }
  }, [isLoggedIn])

  // 网络状态监听
  useEffect(() => {
    const handleOnline = () => {
      setNetworkStatus({
        isOnline: true,
        lastConnected: new Date()
      })
      // 移除自动刷新，让用户手动点击刷新
    }

    const handleOffline = () => {
      setNetworkStatus(prev => ({ ...prev, isOnline: false }))
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, []) // 移除依赖，不再需要refreshAllData

  // 工具函数
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('zh-CN')
  }

  const formatDateTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN')
  }

  const showAnnouncementModal = (announcement: Announcement) => {
    setSelectedAnnouncement(announcement)
    setIsModalOpen(true)
  }

  const getUsagePercentage = () => {
    if (!userInfo) return 0
    const used = userInfo.traffic.upload + userInfo.traffic.download
    return Math.min((used / userInfo.traffic.total) * 100, 100)
  }

  const isExpiringSoon = () => {
    if (!userInfo?.traffic.expire) return false
    const oneWeek = 7 * 24 * 60 * 60 * 1000
    return userInfo.traffic.expire < Date.now() + oneWeek
  }

  if (!isLoggedIn) {
    return (
      <BasePage title={t('userCenter.title')}>
        <div className="relative min-h-[72vh] flex justify-center items-center">
          <div className="pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(60%_40%_at_50%_-10%,black,transparent_70%)]">
            <div className="absolute inset-0 bg-[radial-gradient(1000px_600px_at_50%_-10%,rgba(147,197,253,0.28),transparent_60%)]" />
          </div>
          <Card className="relative w-full max-w-lg shadow-2xl border border-default-200">
            <CardHeader className="pb-4 pt-8 px-8 bg-gradient-to-b from-background to-primary/5">
              <div className="w-full text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <IoPersonOutline className="text-primary text-3xl" />
                </div>
                <h2 className="text-3xl font-extrabold tracking-tight text-foreground">{t('userCenter.login')}</h2>
                <p className="text-default-500 mt-2">登录以访问您的用户中心</p>
              </div>
            </CardHeader>
            <CardBody className="space-y-5 px-8 pb-8">
              {/* 网络状态提示 */}
              {!networkStatus.isOnline && (
                <div className="flex items-center gap-2 text-warning text-sm p-3 bg-warning/10 rounded-lg border border-warning/20">
                  <div className="w-2 h-2 rounded-full bg-warning animate-pulse"></div>
                  <span>网络连接已断开，请检查网络连接</span>
                </div>
              )}
              
              {/* 登录错误提示 */}
              {errors.userInfo && (
                <div className="p-4 bg-danger/10 border border-danger/20 rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-danger/20 flex items-center justify-center mt-0.5">
                      <span className="text-danger text-xs font-bold">!</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-danger text-sm font-medium">{errors.userInfo}</p>
                      <Button 
                        variant="light" 
                        size="sm" 
                        onPress={() => setErrors(prev => ({ ...prev, userInfo: null }))}
                        className="mt-2 text-danger hover:bg-danger/10"
                      >
                        关闭提示
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="space-y-4">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="请输入邮箱"
                  size="lg"
                  variant="bordered"
                  radius="lg"
                  isDisabled={loading.userInfo || !networkStatus.isOnline}
                  startContent={<IoPersonOutline className="text-default-400" />}
                  classNames={{
                    input: "text-base",
                    inputWrapper: "h-12 shadow-sm"
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && password) {
                      handleLogin()
                    }
                  }}
                />
                
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  size="lg"
                  variant="bordered"
                  radius="lg"
                  isDisabled={loading.userInfo || !networkStatus.isOnline}
                  startContent={<IoLockClosedOutline className="text-default-400" />}
                  endContent={
                    <button
                      type="button"
                      className="text-default-400 hover:text-foreground transition"
                      onClick={() => setShowPassword(v => !v)}
                      aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    >
                      {showPassword ? <IoEyeOffOutline /> : <IoEyeOutline />}
                    </button>
                  }
                  classNames={{
                    input: "text-base",
                    inputWrapper: "h-12 shadow-sm"
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && email && password) {
                      handleLogin()
                    }
                  }}
                />
              </div>
              
              <Button
                color="primary"
                size="lg"
                variant="solid"
                radius="lg"
                className="w-full h-12 text-base font-extrabold shadow-lg"
                onPress={handleLogin}
                isLoading={loading.userInfo}
                disabled={!email || !password || !networkStatus.isOnline}
              >
                {loading.userInfo ? '登录中...' : t('userCenter.loginButton')}
              </Button>
              
              {/* 服务器选择和测试 */}
              {backends.length >= 1 && (
                <div className="text-center border-t border-default-200 pt-4">
                  <div className="space-y-4 p-4 bg-default-50 rounded-xl border border-default-200 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <IoServerOutline className="text-primary text-lg" />
                        <label className="text-sm font-semibold text-foreground">选择后端服务器</label>
                      </div>
                      <Button
                        size="sm"
                        variant="flat"
                        color="primary"
                        isLoading={isTestingBackends}
                        startContent={!isTestingBackends && <IoSpeedometer className="text-sm" />}
                        onPress={backends.length > 1 ? testAllBackendsAndSelectOptimal : testAllBackends}
                        disabled={isTestingBackends}
                        className="text-xs min-w-fit px-3 shadow-sm"
                      >
                        {isTestingBackends ? '测试中...' : (backends.length > 1 ? '测试并选择最优' : '测试延迟')}
                      </Button>
                    </div>
                    
                    {isTestingBackends && (
                      <div className="flex items-center justify-center gap-2 text-primary text-xs">
                        <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                        <span>正在测试所有后端服务器延迟...</span>
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      {backends.map((backend) => (
                        <div
                          key={backend.id}
                          className={`p-3 rounded-lg border cursor-pointer transition-all duration-200 hover:border-primary hover:shadow-sm ${
                            selectedBackend?.id === backend.id 
                              ? 'border-primary bg-primary/5 shadow-sm' 
                              : 'border-default-200 hover:bg-default-100'
                          }`}
                          onClick={() => {
                            setSelectedBackend(backend)
                            handleBackendSelection(backend.id)
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-sm text-foreground truncate">
                                  {backend.name}
                                </span>
                                {backend.isDefault && (
                                  <Chip size="sm" color="primary" variant="solid" className="text-xs">
                                    默认
                                  </Chip>
                                )}
                                {selectedBackend?.id === backend.id && (
                                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                                )}
                              </div>
                              
                              <div className="flex items-center gap-3">
                                {backend.isActive !== undefined && (
                                  <div className={`flex items-center gap-1 text-xs ${
                                    backend.isActive ? 'text-success' : 'text-danger'
                                  }`}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${
                                      backend.isActive ? 'bg-success' : 'bg-danger'
                                    }`}></div>
                                    {backend.isActive ? '在线' : '离线'}
                                  </div>
                                )}
                                {backend.lastPing && (
                                  <div className={`flex items-center gap-1 text-xs ${
                                    backend.lastPing < 300 ? 'text-success' : 
                                    backend.lastPing < 1000 ? 'text-warning' : 'text-danger'
                                  }`}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${
                                      backend.lastPing < 300 ? 'bg-success' : 
                                      backend.lastPing < 1000 ? 'bg-warning' : 'bg-danger'
                                    }`}></div>
                                    {backend.lastPing < 100 ? '极快' : 
                                     backend.lastPing < 300 ? '很快' : 
                                     backend.lastPing < 1000 ? '良好' : '较慢'} 
                                    ({backend.lastPing}ms)
                                  </div>
                                )}
                                {!backend.lastPing && !isTestingBackends && (
                                  <div className="text-xs text-default-400">
                                    未测试
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="text-xs text-default-500 text-center">
                      {backends.length > 1 ? 
                        '每10秒自动测试并选择最优服务器' : 
                        '每10秒自动测试服务器连接状态'
                      }
                    </div>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </BasePage>
    )
  }

  return (
    <BasePage title={t('userCenter.title')}>
      <div className="space-y-6">
        {/* 网络状态提示 */}
        {!networkStatus.isOnline && (
          <Card className="border-warning">
            <CardBody className="py-3">
              <div className="flex items-center gap-2 text-warning">
                <div className="w-2 h-2 rounded-full bg-warning animate-pulse"></div>
                <span className="text-sm">网络连接已断开，数据可能不是最新的</span>
              </div>
            </CardBody>
          </Card>
        )}
        {/* 顶部操作区：刷新 / 退出登录 */}
        <div className="flex justify-end gap-2">
          <Button variant="light" size="sm" onPress={handleLogout} color="danger">
            {t('userCenter.logout')}
          </Button>
        </div>

        {/* 公告模块 —— 横排卡片 */}
        <Card>
          <CardHeader className="flex justify-between">
            <h3 className="text-lg font-semibold">{t('userCenter.announcements')}</h3>
            <div className="flex items-center gap-2">
              {loading.announcements && <Spinner size="sm" />}
            </div>
          </CardHeader>
          <CardBody>
            {errors.announcements ? (
              <div className="text-center py-8">
                <div className="text-danger mb-2">
                  <p>加载失败: {errors.announcements}</p>
                </div>
                <div className="flex justify-center gap-2">
                  <Button 
                    variant="light" 
                    size="sm" 
                    onPress={() => fetchAnnouncements(true)}
                    isLoading={loading.announcements}
                  >
                    重试
                  </Button>
                  <Button 
                    variant="light" 
                    size="sm" 
                    onPress={() => setErrors(prev => ({ ...prev, announcements: null }))}
                  >
                    关闭错误
                  </Button>
                </div>
              </div>
            ) : loading.announcements && announcements.length === 0 ? (
              <div className="flex justify-center py-8">
                <div className="flex flex-col items-center gap-2">
                  <Spinner />
                  <p className="text-sm text-default-500">加载公告中...</p>
                </div>
              </div>
            ) : announcements.length > 0 ? (
              <div className="no-scrollbar flex gap-4 overflow-x-auto snap-x snap-mandatory py-1">
                {announcements.map((announcement) => (
                  <Card
                    key={announcement.id}
                    isPressable
                    onPress={() => showAnnouncementModal(announcement)}
                    className="min-w-[180px] w-[180px] h-[180px] snap-start hover:shadow-lg transition-shadow"
                  >
                    <CardBody className="h-full flex items-center justify-center p-4 text-center">
                      <div className="font-semibold text-foreground line-clamp-3">
                        {announcement.title}
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center text-default-500 py-8">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-default-100 flex items-center justify-center">
                    <span className="text-default-400">📢</span>
                  </div>
                  <p>暂无公告</p>
                  <Button 
                    variant="light" 
                    size="sm" 
                    onPress={() => fetchAnnouncements(true)}
                  >
                    刷新试试
                  </Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        {/* 流量信息模块 */}
        <Card>
          <CardHeader className="flex justify-between">
            <h3 className="text-lg font-semibold">{t('userCenter.traffic')}</h3>
            {loading.userInfo && <Spinner size="sm" />}
          </CardHeader>
          <CardBody>
            {errors.userInfo ? (
              <div className="text-center py-8 text-danger">
                <p>加载失败: {errors.userInfo}</p>
                <Button 
                  variant="light" 
                  size="sm" 
                  onPress={() => fetchUserInfo(true)}
                  className="mt-2"
                >
                  重试
                </Button>
              </div>
            ) : userInfo ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {formatBytes(userInfo.traffic.upload)}
                    </div>
                    <div className="text-sm text-default-500 mt-1">
                      {t('userCenter.upload')}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {formatBytes(userInfo.traffic.download)}
                    </div>
                    <div className="text-sm text-default-500 mt-1">
                      {t('userCenter.download')}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      {formatBytes(userInfo.traffic.upload + userInfo.traffic.download)}
                    </div>
                    <div className="text-sm text-default-500 mt-1">
                      {t('userCenter.totalUsed')}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {formatBytes(userInfo.traffic.total)}
                    </div>
                    <div className="text-sm text-default-500 mt-1">
                      {t('userCenter.totalLimit')}
                    </div>
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>使用进度</span>
                    <span>{getUsagePercentage().toFixed(1)}%</span>
                  </div>
                  <Progress 
                    value={getUsagePercentage()} 
                    color={getUsagePercentage() > 80 ? 'danger' : getUsagePercentage() > 60 ? 'warning' : 'primary'}
                    className="h-3"
                  />
                </div>

                <div className="pt-4 border-t border-default-200">
                  <div className="flex justify-between">
                    <span className="font-medium">{t('userCenter.expire')}:</span>
                    <span className={isExpiringSoon() ? 'text-warning font-medium' : 'text-foreground'}>
                      {userInfo.traffic.expire ? formatDate(userInfo.traffic.expire) : t('sider.cards.neverExpire')}
                      {isExpiringSoon() && <span className="ml-2 text-xs">(即将过期)</span>}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            )}
          </CardBody>
        </Card>

        

        {/* 公告详情模态框 */}
        <Modal 
          isOpen={isModalOpen} 
          onOpenChange={setIsModalOpen}
          size="2xl"
          scrollBehavior="inside"
        >
          <ModalContent>
            <ModalHeader className="flex justify-between items-center">
              <div className="flex flex-col gap-1 flex-1">
                <h3 className="text-xl font-bold">{selectedAnnouncement?.title}</h3>
                <span className="text-sm text-default-500">{selectedAnnouncement?.date}</span>
              </div>
              <Button
                isIconOnly
                variant="light"
                size="sm"
                onPress={() => setIsModalOpen(false)}
              >
                <IoCloseOutline />
              </Button>
            </ModalHeader>
            <Divider />
            <ModalBody className="py-6">
              <div className="prose max-w-none">
                <div 
                  className="whitespace-pre-wrap leading-relaxed text-foreground"
                  dangerouslySetInnerHTML={{ 
                    __html: selectedAnnouncement?.content?.replace(/\n/g, '<br>') || ''
                  }}
                />
              </div>
            </ModalBody>
          </ModalContent>
        </Modal>
      </div>
    </BasePage>
  )
}

export default UserCenter
