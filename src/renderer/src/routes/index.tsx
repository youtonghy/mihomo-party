import { Navigate } from 'react-router-dom'
import Override from '@renderer/pages/override'
import Proxies from '@renderer/pages/proxies'
import Rules from '@renderer/pages/rules'
import Settings from '@renderer/pages/settings'
import Profiles from '@renderer/pages/profiles'
import Logs from '@renderer/pages/logs'
import Connections from '@renderer/pages/connections'
import Mihomo from '@renderer/pages/mihomo'
import Sysproxy from '@renderer/pages/sysproxy'
import Tun from '@renderer/pages/tun'
import Resources from '@renderer/pages/resources'
import DNS from '@renderer/pages/dns'
import Sniffer from '@renderer/pages/sniffer'
import SubStore from '@renderer/pages/substore'
import UserCenter from '@renderer/pages/user-center'
import Support from '@renderer/pages/support'
import Store from '@renderer/pages/store'
const routes = [
  {
    path: '/user-center',
    element: <UserCenter />
  },
  {
    path: '/store',
    element: <Store />
  },
  {
    path: '/support',
    element: <Support />
  },
  {
    path: '/mihomo',
    element: <Mihomo />
  },
  {
    path: '/sysproxy',
    element: <Sysproxy />
  },
  {
    path: '/tun',
    element: <Tun />
  },
  {
    path: '/proxies',
    element: <Proxies />
  },
  {
    path: '/rules',
    element: <Rules />
  },
  {
    path: '/resources',
    element: <Resources />
  },
  {
    path: '/dns',
    element: <DNS />
  },
  {
    path: '/sniffer',
    element: <Sniffer />
  },
  {
    path: '/logs',
    element: <Logs />
  },
  {
    path: '/connections',
    element: <Connections />
  },
  {
    path: '/override',
    element: <Override />
  },
  {
    path: '/profiles',
    element: <Profiles />
  },
  {
    path: '/settings',
    element: <Settings />
  },
  {
    path: '/substore',
    element: <SubStore />
  },
  {
    path: '/',
    element: <Navigate to="/proxies" />
  }
]

export default routes
