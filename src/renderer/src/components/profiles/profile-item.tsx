import {
  Button,
  Card,
  CardBody,
  CardFooter,
  Chip,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Progress,
  Tooltip
} from '@heroui/react'
import { calcPercent, calcTraffic } from '@renderer/utils/calc'
import { IoMdMore, IoMdRefresh } from 'react-icons/io'
import dayjs from '@renderer/utils/dayjs'
import React, { Key, useEffect, useMemo, useState } from 'react'
import EditFileModal from './edit-file-modal'
import EditInfoModal from './edit-info-modal'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { openFile } from '@renderer/utils/ipc'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

interface Props {
  info: IProfileItem
  isCurrent: boolean
  addProfileItem: (item: Partial<IProfileItem>) => Promise<void>
  updateProfileItem: (item: IProfileItem) => Promise<void>
  removeProfileItem: (id: string) => Promise<void>
  mutateProfileConfig: () => void
  onPress: () => Promise<void>
}

interface MenuItem {
  key: string
  label: string
  showDivider: boolean
  color: 'default' | 'danger'
  className: string
}
const ProfileItem: React.FC<Props> = (props) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const {
    info,
    addProfileItem,
    removeProfileItem,
    mutateProfileConfig,
    updateProfileItem,
    onPress,
    isCurrent
  } = props
  const extra = info?.extra
  const usage = (extra?.upload ?? 0) + (extra?.download ?? 0)
  const total = extra?.total ?? 0
  const { appConfig, patchAppConfig } = useAppConfig()
  const { profileDisplayDate = 'expire' } = appConfig || {}
  const [updating, setUpdating] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [openInfoEditor, setOpenInfoEditor] = useState(false)
  const [openFileEditor, setOpenFileEditor] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform: tf,
    transition,
    isDragging
  } = useSortable({
    id: info.id
  })
  const transform = tf ? { x: tf.x, y: tf.y, scaleX: 1, scaleY: 1 } : null
  const [disableSelect, setDisableSelect] = useState(false)

  const menuItems: MenuItem[] = useMemo(() => {
    // Check if this is the special user subscription
    const isUserSubscription = info.id === 'user-subscription-meta'
    const isEmptyUserSubscription = isUserSubscription && info.url === 'https://example.com/empty-subscription'
    
    const list = []

    // Only add edit options if it's not an empty user subscription
    if (!isEmptyUserSubscription) {
      list.push(
        {
          key: 'edit-info',
          label: t('profiles.editInfo.title'),
          showDivider: false,
          color: 'default',
          className: ''
        } as MenuItem,
        {
          key: 'edit-file',
          label: t('profiles.editFile.title'),
          showDivider: false,
          color: 'default',
          className: ''
        } as MenuItem,
        {
          key: 'open-file',
          label: t('profiles.openFile'),
          showDivider: true,
          color: 'default',
          className: ''
        } as MenuItem
      )
    }

    // Only add delete option if this is not the user subscription at all
    if (!isUserSubscription) {
      list.push({
        key: 'delete',
        label: t('common.delete'),
        showDivider: false,
        color: 'danger',
        className: 'text-danger'
      } as MenuItem)
    }

    if (info.home && !isEmptyUserSubscription) {
      list.unshift({
        key: 'home',
        label: t('profiles.home'),
        showDivider: false,
        color: 'default',
        className: ''
      } as MenuItem)
    }
    
    // If empty user subscription, show a message item
    if (isEmptyUserSubscription) {
      list.push({
        key: 'login-required',
        label: '请先登录用户中心',
        showDivider: false,
        color: 'default',
        className: 'text-default-500'
      } as MenuItem)
    }
    
    return list
  }, [info, t])

  const onMenuAction = async (key: Key): Promise<void> => {
    switch (key) {
      case 'edit-info': {
        setOpenInfoEditor(true)
        break
      }
      case 'edit-file': {
        setOpenFileEditor(true)
        break
      }
      case 'open-file': {
        openFile('profile', info.id)
        break
      }
      case 'delete': {
        await removeProfileItem(info.id)
        mutateProfileConfig()
        break
      }
      case 'home': {
        open(info.home)
        break
      }
      case 'login-required': {
        // Navigate to user center for login
        navigate('/user-center')
        break
      }
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDropdownOpen(true)
  }

  useEffect(() => {
    if (isDragging) {
      setTimeout(() => {
        setDisableSelect(true)
      }, 200)
    } else {
      setTimeout(() => {
        setDisableSelect(false)
      }, 200)
    }
  }, [isDragging])



  return (
    <div
      className="grid col-span-1"
      style={{
        position: 'relative',
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 'calc(infinity)' : undefined
      }}
    >
      {openFileEditor && <EditFileModal id={info.id} onClose={() => setOpenFileEditor(false)} />}
      {openInfoEditor && (
        <EditInfoModal
          item={info}
          onClose={() => setOpenInfoEditor(false)}
          updateProfileItem={updateProfileItem}
        />
      )}
      
      <Card
        as="div"
        fullWidth
        isPressable
        onPress={() => {
          if (disableSelect) return
          setSelecting(true)
          onPress().finally(() => {
            setSelecting(false)
          })
        }}
        onContextMenu={handleContextMenu}
        className={`${isCurrent ? 'bg-primary' : ''} ${selecting ? 'blur-sm' : ''}`}
      >
        <div ref={setNodeRef} {...attributes} {...listeners} className="w-full h-full">
          <CardBody className="pb-1">
            <div className="flex justify-between h-[32px]">
              <div className="flex items-center gap-2 overflow-hidden">
                <h3
                  title={info?.name}
                  className={`text-ellipsis whitespace-nowrap overflow-hidden text-md font-bold leading-[32px] ${isCurrent ? 'text-primary-foreground' : 'text-foreground'}`}
                >
                  {info?.name}
                </h3>
                {info.id === 'user-subscription-meta' && (
                  <Chip 
                    size="sm" 
                    color={info.url === 'https://example.com/empty-subscription' ? 'default' : 'warning'} 
                    variant="flat"
                    className="text-xs"
                  >
                    {info.url === 'https://example.com/empty-subscription' ? '未登录' : '用户订阅'}
                  </Chip>
                )}
              </div>
              <div className="flex">
                {info.type === 'remote' && info.url !== 'https://example.com/empty-subscription' && (
                  <Tooltip placement="left" content={dayjs(info.updated).fromNow()}>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      color="default"
                      disabled={updating}
                      onPress={async () => {
                        setUpdating(true)
                        await addProfileItem(info)
                        setUpdating(false)
                      }}
                    >
                      <IoMdRefresh
                        color="default"
                        className={`${isCurrent ? 'text-primary-foreground' : 'text-foreground'} text-[24px] ${updating ? 'animate-spin' : ''}`}
                      />
                    </Button>
                  </Tooltip>
                )}

                <Dropdown
                  isOpen={dropdownOpen}
                  onOpenChange={setDropdownOpen}
                >
                  <DropdownTrigger>
                    <Button isIconOnly size="sm" variant="light" color="default">
                      <IoMdMore
                        color="default"
                        className={`text-[24px] ${isCurrent ? 'text-primary-foreground' : 'text-foreground'}`}
                      />
                    </Button>
                  </DropdownTrigger>
                  <DropdownMenu onAction={onMenuAction}>
                    {menuItems.map((item) => (
                      <DropdownItem
                        showDivider={item.showDivider}
                        key={item.key}
                        color={item.color}
                        className={item.className}
                      >
                        {item.label}
                      </DropdownItem>
                    ))}
                  </DropdownMenu>
                </Dropdown>
              </div>
            </div>
            {info.type === 'remote' && extra && (
              <div
                className={`mt-2 flex justify-between ${isCurrent ? 'text-primary-foreground' : 'text-foreground'}`}
              >
                <small>{`${calcTraffic(usage)}/${calcTraffic(total)}`}</small>
                {profileDisplayDate === 'expire' ? (
                  <Button
                    size="sm"
                    variant="light"
                    className={`h-[20px] p-1 m-0 ${isCurrent ? 'text-primary-foreground' : 'text-foreground'}`}
                    onPress={async () => {
                      await patchAppConfig({ profileDisplayDate: 'update' })
                    }}
                  >
                    {extra.expire ? dayjs.unix(extra.expire).format('YYYY-MM-DD') : t('profiles.neverExpire')}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="light"
                    className={`h-[20px] p-1 m-0 ${isCurrent ? 'text-primary-foreground' : 'text-foreground'}`}
                    onPress={async () => {
                      await patchAppConfig({ profileDisplayDate: 'expire' })
                    }}
                  >
                    {dayjs(info.updated).fromNow()}
                  </Button>
                )}
              </div>
            )}
          </CardBody>
          <CardFooter className="pt-0">
            {info.type === 'remote' && !extra && (
              <div
                className={`w-full mt-2 flex justify-between ${isCurrent ? 'text-primary-foreground' : 'text-foreground'}`}
              >
                <Chip
                  size="sm"
                  variant="bordered"
                  className={`${isCurrent ? 'text-primary-foreground border-primary-foreground' : 'border-primary text-primary'}`}
                >
                    {t('profiles.remote')}
                </Chip>
                <small>{dayjs(info.updated).fromNow()}</small>
              </div>
            )}
            {info.type === 'local' && (
              <div
                className={`mt-2 flex justify-between ${isCurrent ? 'text-primary-foreground' : 'text-foreground'}`}
              >
                <Chip
                  size="sm"
                  variant="bordered"
                  className={`${isCurrent ? 'text-primary-foreground border-primary-foreground' : 'border-primary text-primary'}`}
                >
                    {t('profiles.local')}
                </Chip>
              </div>
            )}
            {extra && (
              <Progress
                className="w-full"
                  aria-label={t('profiles.trafficUsage')}
                classNames={{
                  indicator: isCurrent ? 'bg-primary-foreground' : 'bg-foreground'
                }}
                value={calcPercent(extra?.upload, extra?.download, extra?.total)}
              />
            )}
          </CardFooter>
        </div>
      </Card>
    </div>
  )
}

export default ProfileItem