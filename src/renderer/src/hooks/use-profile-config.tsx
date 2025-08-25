import React, { createContext, useContext, ReactNode, useMemo, useEffect, useState } from 'react'
import useSWR from 'swr'
import {
  getProfileConfig,
  setProfileConfig as set,
  addProfileItem as add,
  removeProfileItem as remove,
  updateProfileItem as update,
  changeCurrentProfile as change
} from '@renderer/utils/ipc'
import { createUserAuthUtils } from '@renderer/utils/user-auth'
import { useAppConfig } from './use-app-config'

interface ProfileConfigContextType {
  profileConfig: IProfileConfig | undefined
  setProfileConfig: (config: IProfileConfig) => Promise<void>
  mutateProfileConfig: () => void
  addProfileItem: (item: Partial<IProfileItem>) => Promise<void>
  updateProfileItem: (item: IProfileItem) => Promise<void>
  removeProfileItem: (id: string) => Promise<void>
  changeCurrentProfile: (id: string) => Promise<void>
  refreshUserSubscription: () => Promise<void>
}

const ProfileConfigContext = createContext<ProfileConfigContextType | undefined>(undefined)

export const ProfileConfigProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { data: rawProfileConfig, mutate: mutateProfileConfig } = useSWR('getProfileConfig', () =>
    getProfileConfig()
  )
  const { appConfig } = useAppConfig()
  const [userSubscriptionUrl, setUserSubscriptionUrl] = useState<string | null>(null)

  // Fetch user subscription URL when login state changes
  useEffect(() => {
    const fetchUserSubscriptionUrl = async () => {
      const userAuthUtils = createUserAuthUtils(appConfig)
      const isLoggedIn = userAuthUtils.isLoggedIn()
      
      if (isLoggedIn) {
        try {
          const url = await userAuthUtils.getUserSubscriptionUrl()
          setUserSubscriptionUrl(url)
        } catch (error) {
          console.error('Failed to fetch user subscription URL:', error)
          setUserSubscriptionUrl(null)
        }
      } else {
        setUserSubscriptionUrl(null)
      }
    }

    fetchUserSubscriptionUrl()
  }, [appConfig])

  // Enhanced profile config that includes user subscription when logged in
  const profileConfig = useMemo(() => {
    if (!rawProfileConfig) return rawProfileConfig

    const userAuthUtils = createUserAuthUtils(appConfig)
    const isLoggedIn = userAuthUtils.isLoggedIn()
    
    // Define the special user subscription item
    const USER_SUBSCRIPTION_ID = 'user-subscription-meta'
    
    // Always create user subscription item, but with different URLs based on login state
    const userSubscriptionItem: IProfileItem = {
      id: USER_SUBSCRIPTION_ID,
      type: 'remote',
      name: '用户订阅 (Clash Meta)',
      url: isLoggedIn && userSubscriptionUrl ? userSubscriptionUrl : 'https://example.com/empty-subscription', // 空白占位URL
      interval: 60 * 60, // 60分钟更新一次 (3600秒)
      updated: Date.now(),
      override: [],
      useProxy: false,
      allowFixedInterval: false,
      substore: false
    }

    // Check if user subscription already exists
    const hasUserSubscription = rawProfileConfig.items.some(item => item.id === USER_SUBSCRIPTION_ID)
    
    let items = [...rawProfileConfig.items]
    
    if (!hasUserSubscription) {
      // Add user subscription at the beginning of the list
      items.unshift(userSubscriptionItem)
    } else {
      // Update existing user subscription with current URL and settings
      const index = items.findIndex(item => item.id === USER_SUBSCRIPTION_ID)
      if (index !== -1) {
        items[index] = { ...items[index], ...userSubscriptionItem, updated: Date.now() }
      }
    }

    // Auto-select user subscription if no profile is currently selected and user is logged in
    let current = rawProfileConfig.current
    if (!current && isLoggedIn && userSubscriptionUrl && items.length > 0) {
      current = USER_SUBSCRIPTION_ID
    }

    return {
      ...rawProfileConfig,
      current,
      items
    }
  }, [rawProfileConfig, appConfig, userSubscriptionUrl])

  const setProfileConfig = async (config: IProfileConfig): Promise<void> => {
    try {
      await set(config)
    } catch (e) {
      alert(e)
    } finally {
      mutateProfileConfig()
      window.electron.ipcRenderer.send('updateTrayMenu')
    }
  }

  const addProfileItem = async (item: Partial<IProfileItem>): Promise<void> => {
    try {
      await add(item)
    } catch (e) {
      alert(e)
    } finally {
      mutateProfileConfig()
      window.electron.ipcRenderer.send('updateTrayMenu')
    }
  }

  const removeProfileItem = async (id: string): Promise<void> => {
    // Prevent deletion of user subscription
    const USER_SUBSCRIPTION_ID = 'user-subscription-meta'
    if (id === USER_SUBSCRIPTION_ID) {
      alert('用户订阅不能被删除')
      return
    }
    
    try {
      await remove(id)
    } catch (e) {
      alert(e)
    } finally {
      mutateProfileConfig()
      window.electron.ipcRenderer.send('updateTrayMenu')
    }
  }

  const updateProfileItem = async (item: IProfileItem): Promise<void> => {
    try {
      await update(item)
    } catch (e) {
      alert(e)
    } finally {
      mutateProfileConfig()
      window.electron.ipcRenderer.send('updateTrayMenu')
    }
  }

  const changeCurrentProfile = async (id: string): Promise<void> => {
    try {
      await change(id)
    } catch (e) {
      alert(e)
    } finally {
      mutateProfileConfig()
      window.electron.ipcRenderer.send('updateTrayMenu')
    }
  }

  const refreshUserSubscription = async (): Promise<void> => {
    const userAuthUtils = createUserAuthUtils(appConfig)
    const isLoggedIn = userAuthUtils.isLoggedIn()
    
    if (isLoggedIn) {
      try {
        const url = await userAuthUtils.getUserSubscriptionUrl()
        setUserSubscriptionUrl(url)
      } catch (error) {
        console.error('Failed to refresh user subscription URL:', error)
        setUserSubscriptionUrl(null)
      }
    } else {
      setUserSubscriptionUrl(null)
    }
  }

  React.useEffect(() => {
    window.electron.ipcRenderer.on('profileConfigUpdated', () => {
      mutateProfileConfig()
    })
    return (): void => {
      window.electron.ipcRenderer.removeAllListeners('profileConfigUpdated')
    }
  }, [])

  return (
    <ProfileConfigContext.Provider
      value={{
        profileConfig,
        setProfileConfig,
        mutateProfileConfig,
        addProfileItem,
        removeProfileItem,
        updateProfileItem,
        changeCurrentProfile,
        refreshUserSubscription
      }}
    >
      {children}
    </ProfileConfigContext.Provider>
  )
}

export const useProfileConfig = (): ProfileConfigContextType => {
  const context = useContext(ProfileConfigContext)
  if (context === undefined) {
    throw new Error('useProfileConfig must be used within a ProfileConfigProvider')
  }
  return context
}
