/**
 * User authentication state management utility
 */

export interface UserTokenData {
  token: string
  expiresAt: number
  createdAt: number
}

/**
 * Create user auth utils with app config
 */
export const createUserAuthUtils = (appConfig?: IAppConfig) => {
  const utils = {
    /**
     * Check if user is currently logged in (has valid token)
     */
    isLoggedIn: (): boolean => {
      const token = localStorage.getItem('userToken')
      const tokenDataStr = localStorage.getItem('userTokenData')
      
      if (!token || !tokenDataStr) {
        return false
      }
      
      try {
        const tokenData: UserTokenData = JSON.parse(tokenDataStr)
        const now = Date.now()
        
        // Check if token is expired
        if (tokenData.expiresAt && now > tokenData.expiresAt) {
          // Token expired, clean up
          utils.clearToken()
          return false
        }
        
        return true
      } catch {
        // Data format error, clean up
        utils.clearToken()
        return false
      }
    },

    /**
     * Get current auth token if valid
     */
    getToken: (): string | null => {
      if (!utils.isLoggedIn()) {
        return null
      }
      return localStorage.getItem('userToken')
    },

    /**
     * Clear stored auth token
     */
    clearToken: (): void => {
      localStorage.removeItem('userToken')
      localStorage.removeItem('userTokenData')
      localStorage.removeItem('userEmail')
    },

    /**
     * Get user subscription URL by calling API
     * Uses the same method as user-center.tsx
     */
    getUserSubscriptionUrl: async (): Promise<string | null> => {
      const token = utils.getToken()
      if (!token) return null
      
      const loginUrl = utils.getLoginUrl()
      
      try {
        const response = await fetch(`${loginUrl}/api/v1/user/getSubscribe`, {
          headers: {
            'Authorization': token,
            'Content-Type': 'application/json'
          }
        })

        if (response.status === 401) {
          // Token invalid, clean up
          utils.clearToken()
          return null
        }

        if (!response.ok) {
          console.error('Failed to get subscription URL:', response.status)
          return null
        }

        const data = await response.json()
        
        // Return the subscribe_url from response data
        if (data.data && data.data.subscribe_url) {
          return data.data.subscribe_url
        }
        
        return null
      } catch (error) {
        console.error('Error fetching subscription URL:', error)
        return null
      }
    },

    /**
     * Get login URL from configuration
     */
    getLoginUrl: (): string => {
      // Use the configured URL or fallback to default
      return appConfig?.userCenterLoginUrl || 'https://vpn.200461.xyz'
    }
  }

  return utils
}

// Default instance for backward compatibility
export const userAuthUtils = createUserAuthUtils()