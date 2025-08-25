import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardBody, CardHeader, Input, Button, Modal, ModalContent, ModalHeader, ModalBody, Divider, Spinner, Progress } from '@heroui/react'
import { useTranslation } from 'react-i18next'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { IoRefreshOutline, IoCloseOutline, IoPersonOutline, IoLockClosedOutline } from 'react-icons/io5'
import BasePage from '@renderer/components/base/base-page'

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
  const { appConfig } = useAppConfig()
  const { refreshUserSubscription } = useProfileConfig()
  // Use configurable login URL or fallback to default
  const loginUrl = appConfig?.userCenterLoginUrl || 'https://vpn.200461.xyz'
  
  // 状态管理
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  
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
    
    // 刷新用户订阅为空白状态
    refreshUserSubscription().catch(console.error)
  }

  // 初始化
  useEffect(() => {
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
  }, [fetchUserInfo, fetchAnnouncements, testServerConnection])

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
        <div className="flex justify-center items-center min-h-[70vh]">
          <Card className="w-full max-w-lg shadow-xl">
            <CardHeader className="pb-4 pt-8 px-8">
              <div className="w-full text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <IoPersonOutline className="text-primary text-3xl" />
                </div>
                <h2 className="text-3xl font-bold text-foreground">{t('userCenter.login')}</h2>
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
                  isDisabled={loading.userInfo || !networkStatus.isOnline}
                  startContent={<IoPersonOutline className="text-default-400" />}
                  classNames={{
                    input: "text-base",
                    inputWrapper: "h-12"
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && password) {
                      handleLogin()
                    }
                  }}
                />
                
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  size="lg"
                  isDisabled={loading.userInfo || !networkStatus.isOnline}
                  startContent={<IoLockClosedOutline className="text-default-400" />}
                  classNames={{
                    input: "text-base",
                    inputWrapper: "h-12"
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
                className="w-full h-12 text-base font-semibold"
                onPress={handleLogin}
                isLoading={loading.userInfo}
                disabled={!email || !password || !networkStatus.isOnline}
              >
                {loading.userInfo ? '登录中...' : t('userCenter.loginButton')}
              </Button>
              
              {/* 服务器连接测试 */}
              <div className="text-center border-t border-default-200 pt-4">
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="light" 
                      size="sm"
                      isLoading={serverTestStatus.isLoading}
                      startContent={
                        !serverTestStatus.isLoading && (
                          <div className={`w-2 h-2 rounded-full ${
                            serverTestStatus.lastPing !== null 
                              ? (serverTestStatus.lastPing < 1000 ? 'bg-green-500' : serverTestStatus.lastPing < 3000 ? 'bg-yellow-500' : 'bg-orange-500')
                              : (networkStatus.isOnline ? 'bg-green-500' : 'bg-red-500')
                          }`}></div>
                        )
                      }
                      endContent={
                        !serverTestStatus.isLoading && serverTestStatus.lastTest && (
                          <IoRefreshOutline className="text-default-400 text-sm" />
                        )
                      }
                      onPress={testServerConnection}
                      disabled={serverTestStatus.isLoading}
                      className="px-3 py-2"
                    >
                      {serverTestStatus.isLoading ? '测试中...' : 
                       serverTestStatus.lastTest ? '重新测试' : '测试服务器连接'}
                    </Button>
                  </div>
                  
                  {/* 测试结果显示 */}
                  {serverTestStatus.lastTest && (
                    <div className="text-xs text-default-500 text-center">
                      {serverTestStatus.lastPing !== null ? (
                        <div className="flex items-center justify-center gap-2 text-green-600">
                          <span>✓ 连接正常</span>
                          <span className="text-default-400">•</span>
                          <span className="text-default-600">
                            {serverTestStatus.lastPing < 100 ? '极快' : 
                             serverTestStatus.lastPing < 300 ? '很快' : 
                             serverTestStatus.lastPing < 1000 ? '良好' :
                             serverTestStatus.lastPing < 3000 ? '一般' : '较慢'} 
                            ({serverTestStatus.lastPing}ms)
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2 text-red-600">
                          <span>✗ 连接失败</span>
                          <span className="text-default-400">•</span>
                          <span className="text-default-600">请检查网络</span>
                        </div>
                      )}
                      <div className="text-xs text-default-400 mt-1">
                        最后测试: {formatDateTime(serverTestStatus.lastTest.getTime())}
                      </div>
                    </div>
                  )}
                  
                  {!serverTestStatus.lastTest && !serverTestStatus.isLoading && (
                    <p className="text-xs text-default-400">
                      正在自动检测服务器连接状态...
                    </p>
                  )}
                  
                  {serverTestStatus.isLoading && (
                    <p className="text-xs text-default-500">
                      正在测试服务器连接，请稍候...
                    </p>
                  )}
                </div>
              </div>
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

        {/* 用户头部 */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <span className="text-primary font-bold text-lg">
                {userInfo?.email?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{t('userCenter.welcome')}</h1>
                <div className={`w-2 h-2 rounded-full ${networkStatus.isOnline ? 'bg-green-500' : 'bg-red-500'}`} title={networkStatus.isOnline ? '网络已连接' : '网络已断开'}></div>
              </div>
              <p className="text-default-500">{userInfo?.email}</p>
              <div className="flex items-center gap-4 text-xs text-default-400">
                {lastUpdate && (
                  <span>最后更新: {formatDateTime(lastUpdate.getTime())}</span>
                )}
                {networkStatus.lastConnected && (
                  <span>
                    {networkStatus.isOnline ? '在线' : `最后连接: ${formatDateTime(networkStatus.lastConnected.getTime())}`}
                  </span>
                )}
                {/* Token状态显示 */}
                {isLoggedIn && (() => {
                  const remainingDays = tokenManager.getTokenRemainingDays()
                  if (remainingDays > 0) {
                    return (
                      <span className={remainingDays <= 1 ? 'text-warning' : 'text-default-400'}>
                        登录有效期: {remainingDays}天
                      </span>
                    )
                  }
                  return null
                })()}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="light"
              size="sm"
              isIconOnly
              onPress={() => refreshAllData(true)}
              isLoading={loading.userInfo || loading.announcements}
              title="刷新数据"
              isDisabled={!networkStatus.isOnline}
            >
              <IoRefreshOutline />
            </Button>
            <Button variant="light" size="sm" onPress={handleLogout} color="danger">
              {t('userCenter.logout')}
            </Button>
          </div>
        </div>

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

        {/* 公告模块 */}
        <Card>
          <CardHeader className="flex justify-between">
            <h3 className="text-lg font-semibold">{t('userCenter.announcements')}</h3>
            <div className="flex items-center gap-2">
              {loading.announcements && <Spinner size="sm" />}
              <Button
                variant="light"
                size="sm"
                isIconOnly
                onPress={() => fetchAnnouncements(true)}
                isLoading={loading.announcements}
                title="刷新公告"
              >
                <IoRefreshOutline />
              </Button>
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
              <div className="space-y-3">
                {announcements.map((announcement) => (
                  <div
                    key={announcement.id}
                    className="flex justify-between items-center p-3 hover:bg-default-100 rounded-lg cursor-pointer transition-colors border-l-4 border-l-primary/20 hover:border-l-primary"
                    onClick={() => showAnnouncementModal(announcement)}
                  >
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{announcement.title}</div>
                      <div className="text-sm text-default-500 mt-1 line-clamp-2">
                        {announcement.content}
                      </div>
                    </div>
                    <span className="text-sm text-default-400 ml-4 whitespace-nowrap">
                      {announcement.date}
                    </span>
                  </div>
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