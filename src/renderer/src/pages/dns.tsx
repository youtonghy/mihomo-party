import { Button, Tab, Input, Switch, Tabs, Divider } from '@heroui/react'
import BasePage from '@renderer/components/base/base-page'
import { MdDeleteForever } from 'react-icons/md'
import SettingCard from '@renderer/components/base/base-setting-card'
import SettingItem from '@renderer/components/base/base-setting-item'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { restartCore } from '@renderer/utils/ipc'
import React, { Key, ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'

const DNS: React.FC = () => {
  const { t } = useTranslation()
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const { appConfig, patchAppConfig } = useAppConfig()
  const { nameserverPolicy, useNameserverPolicy } = appConfig || {}
  const { dns, hosts } = controledMihomoConfig || {}
  const {
    enable = true,
    ipv6 = false,
    'fake-ip-range': fakeIPRange = '198.18.0.1/16',
    'fake-ip-filter': fakeIPFilter = [
      '*',
      '+.lan',
      '+.local',
      'time.*.com',
      'ntp.*.com',
      '+.market.xiaomi.com'
    ],
    'enhanced-mode': enhancedMode = 'fake-ip',
    'use-hosts': useHosts = false,
    'use-system-hosts': useSystemHosts = false,
    'respect-rules': respectRules = false,
    'default-nameserver': defaultNameserver = ['tls://223.5.5.5'],
    nameserver = ['https://doh.pub/dns-query', 'https://dns.alidns.com/dns-query'],
    'proxy-server-nameserver': proxyServerNameserver = [
      'https://doh.pub/dns-query',
      'https://dns.alidns.com/dns-query'
    ],
    'direct-nameserver': directNameserver = []
  } = dns || {}
  const [changed, setChanged] = useState(false)
  const [values, originSetValues] = useState({
    enable,
    ipv6,
    useHosts,
    enhancedMode,
    fakeIPRange,
    fakeIPFilter,
    useSystemHosts,
    respectRules,
    defaultNameserver,
    nameserver,
    proxyServerNameserver,
    directNameserver,
    useNameserverPolicy,
    nameserverPolicy: Object.entries(nameserverPolicy || {}).map(([domain, value]) => ({
      domain,
      value
    })),
    hosts: Object.entries(hosts || {}).map(([domain, value]) => ({ domain, value }))
  })

  const setValues = (v: typeof values): void => {
    originSetValues(v)
    setChanged(true)
  }

  const handleListChange = (type: string, value: string, index: number): void => {
    const list = [...values[type]]
    if (value.trim()) {
      if (index < list.length) {
        list[index] = value
      } else {
        list.push(value)
      }
    } else {
      list.splice(index, 1)
    }
    setValues({ ...values, [type]: list })
  }

  const renderListInputs = (type: string, placeholder: string): ReactNode => {
    const currentItems = values[type]
    const showNewLine = currentItems.every((item: string) => item.trim() !== '')

    return [...currentItems, ...(showNewLine ? [''] : [])].map((item, index) => (
      <div key={index} className="mt-2 flex">
        <Input
          fullWidth
          size="sm"
          placeholder={placeholder}
          value={typeof item === 'string' ? item : item.domain}
          onValueChange={(v) => handleListChange(type, v, index)}
        />
        {index < values[type].length && (
          <Button
            className="ml-2"
            size="sm"
            variant="flat"
            color="warning"
            onPress={() => handleListChange(type, '', index)}
          >
            <MdDeleteForever className="text-lg" />
          </Button>
        )}
      </div>
    ))
  }

  const handleSubkeyChange = (type: string, domain: string, value: string, index: number): void => {
    const list = [...values[type]]
    const processedValue = value.includes(',')
      ? value.split(',').map((s: string) => s.trim())
      : value.trim()
    if (domain || processedValue) list[index] = { domain: domain.trim(), value: processedValue }
    else list.splice(index, 1)
    setValues({ ...values, [type]: list })
  }

  const onSave = async (patch: Partial<IMihomoConfig>): Promise<void> => {
    await patchAppConfig({
      nameserverPolicy: Object.fromEntries(
        values.nameserverPolicy.map(({ domain, value }) => [domain, value])
      ),
      useNameserverPolicy: values.useNameserverPolicy
    })
    try {
      setChanged(false)
      await patchControledMihomoConfig(patch)
      await restartCore()
    } catch (e) {
      alert(e)
    }
  }

  return (
    <BasePage
      title={t('dns.title')}
      header={
        changed && (
          <Button
            size="sm"
            className="app-nodrag"
            color="primary"
            onPress={() => {
              const dnsConfig = {
                enable: values.enable,
                ipv6: values.ipv6,
                'fake-ip-range': values.fakeIPRange,
                'fake-ip-filter': values.fakeIPFilter,
                'enhanced-mode': values.enhancedMode,
                'use-hosts': values.useHosts,
                'use-system-hosts': values.useSystemHosts,
                'respect-rules': values.respectRules,
                'default-nameserver': values.defaultNameserver,
                nameserver: values.nameserver,
                'proxy-server-nameserver': values.proxyServerNameserver,
                'direct-nameserver': values.directNameserver,
                fallback: undefined,
                'fallback-filter': undefined
              }
              if (values.useNameserverPolicy) {
                dnsConfig['nameserver-policy'] = Object.fromEntries(
                  values.nameserverPolicy.map(({ domain, value }) => [domain, value])
                )
              }
              const result = { dns: dnsConfig }
              if (values.useHosts) {
                result['hosts'] = Object.fromEntries(
                  values.hosts.map(({ domain, value }) => [domain, value])
                )
              }
              onSave(result)
            }}
          >
            {t('common.save')}
          </Button>
        )
      }
    >
      <SettingCard>
        <SettingItem title={t('dns.enable.title')} divider>
          <Switch
            size="sm"
            isSelected={values.enable}
            onValueChange={(v) => {
              setValues({ ...values, enable: v })
            }}
          />
        </SettingItem>
        <SettingItem title={t('dns.enhancedMode.title')} divider>
          <Tabs
            size="sm"
            color="primary"
            selectedKey={values.enhancedMode}
            onSelectionChange={(key: Key) => setValues({ ...values, enhancedMode: key as DnsMode })}
          >
            <Tab key="fake-ip" title={t('dns.enhancedMode.fakeIp')} />
            <Tab key="redir-host" title={t('dns.enhancedMode.redirHost')} />
            <Tab key="normal" title={t('dns.enhancedMode.normal')} />
          </Tabs>
        </SettingItem>
        {values.enhancedMode === 'fake-ip' ? (
          <>
            <SettingItem title={t('dns.fakeIp.range')} divider>
              <Input
                size="sm"
                className="w-[50%]"
                value={values.fakeIPRange}
                placeholder={t('dns.fakeIp.rangePlaceholder')}
                onValueChange={(v) => {
                  setValues({ ...values, fakeIPRange: v })
                }}
              />
            </SettingItem>
            <div className="flex flex-col items-stretch">
              <h3>{t('dns.fakeIp.filter')}</h3>
              {renderListInputs('fakeIPFilter', t('dns.fakeIp.filterPlaceholder'))}
            </div>
            <Divider className="my-2" />
          </>
        ) : null}
        <SettingItem title="IPv6" divider>
          <Switch
            size="sm"
            isSelected={values.ipv6}
            onValueChange={(v) => {
              setValues({ ...values, ipv6: v })
            }}
          />
        </SettingItem>
        <SettingItem title={t('dns.respectRules')} divider>
          <Switch
            size="sm"
            isSelected={values.respectRules}
            onValueChange={(v) => {
              setValues({ ...values, respectRules: v })
            }}
          />
        </SettingItem>

        <div className="flex flex-col items-stretch">
          <h3>{t('dns.defaultNameserver')}</h3>
          {renderListInputs('defaultNameserver', t('dns.defaultNameserverPlaceholder'))}
        </div>
        <Divider className="my-2" />
        <div className="flex flex-col items-stretch">
          <h3>{t('dns.proxyServerNameserver')}</h3>
          {renderListInputs('proxyServerNameserver', t('dns.proxyServerNameserverPlaceholder'))}
        </div>
        <Divider className="my-2" />
        <div className="flex flex-col items-stretch">
          <h3>{t('dns.nameserver')}</h3>
          {renderListInputs('nameserver', t('dns.nameserverPlaceholder'))}
        </div>
        <Divider className="my-2" />
        <div className="flex flex-col items-stretch">
          <h3>{t('dns.directNameserver')}</h3>
          {renderListInputs('directNameserver', t('dns.directNameserverPlaceholder'))}
        </div>
        <Divider className="my-2" />
        <SettingItem title={t('dns.nameserverPolicy.title')} divider>
          <Switch
            size="sm"
            isSelected={values.useNameserverPolicy}
            onValueChange={(v) => {
              setValues({ ...values, useNameserverPolicy: v })
            }}
          />
        </SettingItem>
        {values.useNameserverPolicy && (
          <div className="flex flex-col items-stretch">
            <div className="flex flex-col items-stretch">
              <h3 className="mb-2">{t('dns.nameserverPolicy.list')}</h3>
              {[...values.nameserverPolicy, { domain: '', value: '' }].map(
                ({ domain, value }, index) => (
                  <div key={index} className="flex mb-2">
                    <div className="flex-4">
                      <Input
                        size="sm"
                        fullWidth
                        placeholder={t('dns.nameserverPolicy.domainPlaceholder')}
                        value={domain}
                        onValueChange={(v) =>
                          handleSubkeyChange(
                            'nameserverPolicy',
                            v,
                            Array.isArray(value) ? value.join(',') : value,
                            index
                          )
                        }
                      />
                    </div>
                    <span className="mx-2">:</span>
                    <div className="flex-6 flex">
                      <Input
                        size="sm"
                        fullWidth
                        placeholder={t('dns.nameserverPolicy.serverPlaceholder')}
                        value={Array.isArray(value) ? value.join(',') : value}
                        onValueChange={(v) =>
                          handleSubkeyChange('nameserverPolicy', domain, v, index)
                        }
                      />
                      {index < values.nameserverPolicy.length && (
                        <Button
                          size="sm"
                          color="warning"
                          variant="flat"
                          className="ml-2"
                          onPress={() => handleSubkeyChange('nameserverPolicy', '', '', index)}
                        >
                          <MdDeleteForever className="text-lg" />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        )}
        <SettingItem title={t('dns.systemHosts.title')} divider>
          <Switch
            size="sm"
            isSelected={values.useSystemHosts}
            onValueChange={(v) => {
              setValues({ ...values, useSystemHosts: v })
            }}
          />
        </SettingItem>
        <SettingItem title={t('dns.customHosts.title')}>
          <Switch
            size="sm"
            isSelected={values.useHosts}
            onValueChange={(v) => {
              setValues({ ...values, useHosts: v })
            }}
          />
        </SettingItem>
        {values.useHosts && (
          <div className="flex flex-col items-stretch">
            <h3 className="mb-2">{t('dns.customHosts.list')}</h3>
            {[...values.hosts, { domain: '', value: '' }].map(({ domain, value }, index) => (
              <div key={index} className="flex mb-2">
                <div className="flex-4">
                  <Input
                    size="sm"
                    fullWidth
                    placeholder={t('dns.customHosts.domainPlaceholder')}
                    value={domain}
                    onValueChange={(v) =>
                      handleSubkeyChange(
                        'hosts',
                        v,
                        Array.isArray(value) ? value.join(',') : value,
                        index
                      )
                    }
                  />
                </div>
                <span className="mx-2">:</span>
                <div className="flex-6 flex">
                  <Input
                    size="sm"
                    fullWidth
                    placeholder={t('dns.customHosts.valuePlaceholder')}
                    value={Array.isArray(value) ? value.join(',') : value}
                    onValueChange={(v) => handleSubkeyChange('hosts', domain, v, index)}
                  />
                  {index < values.hosts.length && (
                    <Button
                      size="sm"
                      color="warning"
                      variant="flat"
                      className="ml-2"
                      onPress={() => handleSubkeyChange('hosts', '', '', index)}
                    >
                      <MdDeleteForever className="text-lg" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingCard>
    </BasePage>
  )
}

export default DNS
