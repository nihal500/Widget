/** @jsx jsx */
import {
  React,
  jsx,
  type AllWidgetProps,
  classNames,
  DataSourceComponent,
  type QueriableDataSource,
  Immutable,
  appActions,
  lodash,
  type QueryParams,
  MessageManager,
  DataRecordsSelectionChangeMessage,
  type ClauseValuePair,
  ReactResizeDetector,
  type DataSourceInfo,
  type IMDataSourceInfo,
  getAppStore,
  CONSTANTS,
  DataSourceStatus,
  type IMState,
  dataSourceUtils,
  MutableStoreManager,
  DataSourceManager,
  type DataRecord,
  appConfigUtils,
  WidgetState,
  privilegeUtils,
  AppMode,
  esri,
  type ImmutableArray,
  type QueryRequiredInfo,
  type DataSource,
  cancelablePromise,
  type SceneLayerDataSource,
  AllDataSourceTypes
} from 'jimu-core'
import { Global } from 'jimu-theme'
import {
  type IMConfig,
  type LayersConfig,
  SelectionModeType,
  TableArrangeType,
  type Suggestion
} from '../config'
import {
  loadArcGISJSAPIModules,
  type FeatureDataRecord,
  type FeatureLayerDataSource
} from 'jimu-arcgis'
import defaultMessages from './translations/default'
import {
  WidgetPlaceholder,
  defaultMessages as jimuUIDefaultMessages,
  Button,
  TextInput,
  Tabs,
  Tab,
  Select,
  AdvancedSelect,
  Popper,
  Alert,
  Dropdown,
  DropdownButton,
  DropdownMenu,
  DropdownItem,
  DataActionList,
  DataActionListStyle,
  Tooltip
} from 'jimu-ui'
import { versionManager } from '../version-manager'
import { LayoutItemSizeModes } from 'jimu-layouts/layout-runtime'
import { getStyle, getSuggestionStyle } from './style'
import { fetchSuggestionRecords, minusArray, getGlobalTableTools } from './utils'
import { SearchOutlined } from 'jimu-icons/outlined/editor/search'
import { ArrowLeftOutlined } from 'jimu-icons/outlined/directional/arrow-left'
import { CloseOutlined } from 'jimu-icons/outlined/editor/close'
import { MenuOutlined } from 'jimu-icons/outlined/editor/menu'
import { TrashCheckOutlined } from 'jimu-icons/outlined/editor/trash-check'
import { RefreshOutlined } from 'jimu-icons/outlined/editor/refresh'
import { ListVisibleOutlined } from 'jimu-icons/outlined/editor/list-visible'
import { ShowSelectionOutlined } from 'jimu-icons/outlined/editor/show-selection'
import { MoreHorizontalOutlined } from 'jimu-icons/outlined/application/more-horizontal'
import { TrashOutlined } from 'jimu-icons/outlined/editor/trash'
import { type FeatureLayerQueryParams } from 'jimu-core/data-source'
import { type IFeature } from '@esri/arcgis-rest-types'
import { Fragment } from 'react'
import reactiveUtils from 'esri/core/reactiveUtils'
import { InfoOutlined } from 'jimu-icons/outlined/suggested/info'
// import warningIcon from 'jimu-icons/svg/outlined/suggested/warning.svg'
const { SELECTION_DATA_VIEW_ID, DATA_VIEW_ID_FOR_NO_SELECTION } = CONSTANTS
const EMPTY_QUERY_PARAMS = { where: '1=1', sqlExpression: null } as QueryParams
const tablePlaceholderIcon = require('./assets/icons/placeholder-table.svg')
const runtimeDataSourceKey = 'runtime-usedDs-info'
const SEARCH_TOOL_MIN_SIZE = 300
const TABLE_BREAK_POINTS = 430
const notLoad = [DataSourceStatus.NotReady, DataSourceStatus.LoadError]
const Sanitizer = esri.Sanitizer
const sanitizer = new Sanitizer()
const messages = Object.assign({}, defaultMessages, jimuUIDefaultMessages)

export interface Props {
  appMode: AppMode
  dataSourcesInfo?: { [dsId: string]: DataSourceInfo }
  isRTL: boolean
  stateShowLoading: boolean
  currentPageId: string
  viewInTableObj: { [id: string]: { daLayerItem: LayersConfig, records: DataRecord[] } }
  enableDataAction: boolean
  isWidthAuto: boolean
  isHeightAuto: boolean
  [propName: string]: any
}

export interface State {
  apiLoaded: boolean
  dataSource: QueriableDataSource
  activeTabId: string
  downloadOpen: boolean
  searchText: string
  selectQueryFlag: boolean
  mobileFlag: boolean
  searchToolFlag: boolean
  tableShowColumns: ClauseValuePair[]
  isOpenSearchPopper: boolean
  emptyTable: boolean
  emptyData: boolean
  selectRecords: DataRecord[]
  notReady: boolean
  selfDsChange: boolean
  showLoading: boolean
  interval: number
  autoRefreshLoadingString: string
  isShowSuggestion: boolean
  searchSuggestion: Suggestion[]
  notAllowDel: boolean
  tableLoaded: boolean
  tableTotal: number
  tableSelected: number
  widgetWidth: number
}

export interface tableSelectedItem {
  objectId: number
  feature: IFeature | __esri.Graphic
}

export default class Widget extends React.PureComponent<
AllWidgetProps<IMConfig> & Props,
State
> {
  static versionManager = versionManager
  table: __esri.FeatureTable
  dataSourceChange: boolean
  dataActionCanLoad: boolean
  dataActionTableRecords: { [configId: string]: DataRecord[] }
  dropdownCsv: any
  refs: {
    tableContainer: HTMLInputElement
    advancedSelect: HTMLElement
    searchPopup: HTMLDivElement
    currentEl: HTMLElement
    suggestPopup: HTMLDivElement
    countContainer: HTMLDivElement
  }

  updatingTable: boolean
  removeConfig: boolean
  debounceOnResize: (width, height) => void
  dsManager: DataSourceManager
  autoRefreshLoadingTime: any
  resetAutoRefreshTime: any
  suggestionsQueryTimeout: any
  currentRequestId: number
  timerFn: any
  tableSourceVersion: number
  promises: Array<cancelablePromise.CancelablePromise<any>> = []
  FeatureTable: typeof __esri.FeatureTable = null
  FeatureLayer: typeof __esri.FeatureLayer = null
  TableTemplate: typeof __esri.TableTemplate = null
  geometryEngine: typeof __esri.geometryEngine = null
  Polygon: typeof __esri.Polygon = null

  static mapExtraStateProps = (
    state: IMState,
    props: AllWidgetProps<IMConfig>
  ): Props => {
    const { layoutId, layoutItemId, id } = props
    const currentWidget = state?.appConfig?.widgets?.[id]
    const enableDataAction = currentWidget?.enableDataAction
    const appConfig = state && state.appConfig
    const layout = appConfig.layouts?.[layoutId]
    const layoutSetting = layout?.content?.[layoutItemId]?.setting
    const isHeightAuto =
      layoutSetting?.autoProps?.height === LayoutItemSizeModes.Auto ||
      layoutSetting?.autoProps?.height === true
    const isWidthAuto =
      layoutSetting?.autoProps?.width === LayoutItemSizeModes.Auto ||
      layoutSetting?.autoProps?.width === true
    // runtime ds info map(eg. add data widget)
    const runtimeDataSourceInfos = {}
    const updatedViewInTableObj = props?.mutableStateProps?.viewInTableObj
    for (const key in updatedViewInTableObj) {
      // update label
      const newLabel = updatedViewInTableObj[key]?.daLayerItem?.dataActionDataSource?.dataSourceJson?.label
      if (newLabel) updatedViewInTableObj[key].daLayerItem.name = newLabel
      // update runtime dataSource info
      const dataActionDataSourceId = updatedViewInTableObj[key]?.daLayerItem?.dataActionDataSource?.id
      const dataActionDataSourceInfo = updatedViewInTableObj[key]?.daLayerItem?.dataActionDataSource?.getInfo()
      runtimeDataSourceInfos[`${runtimeDataSourceKey}_${dataActionDataSourceId}`] = dataActionDataSourceInfo
    }
    return {
      appMode: state?.appRuntimeInfo?.appMode,
      isRTL: state?.appContext?.isRTL,
      stateShowLoading: state?.widgetsState?.[props.id]?.showLoading,
      currentPageId: state?.appRuntimeInfo?.currentPageId,
      viewInTableObj: updatedViewInTableObj,
      enableDataAction: enableDataAction === undefined ? true : enableDataAction,
      ...runtimeDataSourceInfos,
      isHeightAuto,
      isWidthAuto
    }
  }

  constructor (props) {
    super(props)

    this.state = {
      apiLoaded: false,
      dataSource: undefined,
      activeTabId: undefined,
      downloadOpen: false,
      searchText: '',
      selectQueryFlag: false,
      mobileFlag: false,
      searchToolFlag: false,
      tableShowColumns: undefined,
      isOpenSearchPopper: false,
      emptyTable: false,
      emptyData: false,
      selectRecords: [],
      notReady: false,
      selfDsChange: false,
      showLoading: false,
      interval: 0,
      autoRefreshLoadingString: '',
      isShowSuggestion: false,
      searchSuggestion: [],
      notAllowDel: true,
      tableLoaded: false,
      tableTotal: 0,
      tableSelected: 0,
      widgetWidth: props?.manifest?.defaultSize?.width || 600
    }
    this.dataSourceChange = false
    this.dataActionCanLoad = true
    this.dataActionTableRecords = {}
    this.updatingTable = false
    this.removeConfig = false
    this.currentRequestId = 0
    this.timerFn = null
    this.tableSourceVersion = undefined
    this.debounceOnResize = lodash.debounce(
      (width, height) => { this.onToolStyleChange(width, height) },
      200
    )
    this.dsManager = DataSourceManager.getInstance()
  }

  static getDerivedStateFromProps (nextProps, prevState) {
    const { config } = nextProps
    const { layersConfig } = config
    const { activeTabId } = prevState
    // get data-action table config
    const daLayersConfig = new Widget(nextProps).getDataActionTable()
    const allLayersConfig = layersConfig.asMutable({ deep: true }).concat(daLayersConfig)
    if ((!activeTabId || allLayersConfig.findIndex(x => x.id === activeTabId) < 0) && allLayersConfig.length > 0) {
      return {
        activeTabId: allLayersConfig[0]?.id
      }
    }
    return null
  }

  componentDidMount () {
    if (!this.state.apiLoaded) {
      loadArcGISJSAPIModules([
        'esri/widgets/FeatureTable',
        'esri/layers/FeatureLayer',
        'esri/widgets/FeatureTable/support/TableTemplate',
        'esri/geometry/geometryEngine',
        'esri/geometry/Polygon'
      ]).then(modules => {
        ;[this.FeatureTable, this.FeatureLayer, this.TableTemplate, this.geometryEngine, this.Polygon] = modules
        this.setState({
          apiLoaded: true
        })
        this.destoryTable().then(() => {
          this.createTable()
        })
      })
    }
  }

  componentWillUnmount () {
    const { id } = this.props
    this.promises.forEach(p => { p.cancel() })
    this.destoryTable()
    clearTimeout(this.suggestionsQueryTimeout)
    clearInterval(this.autoRefreshLoadingTime)
    MutableStoreManager.getInstance().updateStateValue(id, 'viewInTableObj', {})
  }

  componentDidUpdate (prevProps: AllWidgetProps<IMConfig> & Props, prevState: State) {
    const { activeTabId, dataSource } = this.state
    const { id, config, currentPageId, state, appMode, viewInTableObj } = this.props
    const { layersConfig } = config
    const daLayersConfig = this.getDataActionTable()
    const allLayersConfig = layersConfig.asMutable({ deep: true }).concat(daLayersConfig)
    const dataActionActiveObj = this.props?.stateProps?.dataActionActiveObj
    const newActiveTabId = dataActionActiveObj?.dataActionTable ? dataActionActiveObj?.activeTabId : activeTabId
    // deal with runtime update caused by setting change
    this.onSettingChangeRuntime()
    // view in table filter change
    this.onFilterChange(newActiveTabId)
    // The activeTab change caused by setting
    const settingChangeTab = this.props?.stateProps?.settingChangeTab || false
    const activeSettingTabId = this.props?.stateProps?.activeTabId
    if (settingChangeTab && activeSettingTabId && (activeTabId !== activeSettingTabId)) {
      this.props.dispatch(
        appActions.widgetStatePropChange(id, 'settingChangeTab', false)
      )
      if (appMode === AppMode.Run) this.onTagClick(activeSettingTabId)
    }
    // close api table menu
    const controllerClose = state === WidgetState.Closed
    const pageClose = prevProps.currentPageId !== currentPageId
    const liveClose = prevProps.appMode === AppMode.Run && appMode === AppMode.Design
    if ((controllerClose || pageClose || liveClose) && this.table) {
      (this.table as any).menu.open = false
      this.setState({ searchText: '', isShowSuggestion: false })
    }
    // config change
    const prevCurConfig = prevProps.config.layersConfig?.asMutable({ deep: true }).concat(daLayersConfig).find(
      item => item.id === prevState.activeTabId
    )
    const newCurConfig = allLayersConfig.find(
      item => item.id === newActiveTabId
    )
    // check if the ds is available
    const dsAvailable = this.dsManager.getDataSource(dataSource?.id)
    // close table tab
    if (this.removeConfig) {
      this.removeConfig = false
      if (!newCurConfig) return
    } else {
      const viewInTableIds = viewInTableObj && Object.keys(viewInTableObj)
      if ((viewInTableIds?.length === 0 && !prevCurConfig) || !newCurConfig) return
    }
    // search close
    const orgSearchOn = prevCurConfig?.enableSearch && prevCurConfig?.searchFields
    const newSearchOn = newCurConfig?.enableSearch && newCurConfig?.searchFields
    if (orgSearchOn && !newSearchOn && dsAvailable) {
      dataSource.updateQueryParams(EMPTY_QUERY_PARAMS, id)
    }
    // setting options change
    const optionChangeFlag = this.settingOptionsChange(prevCurConfig, newCurConfig)
    const tabChange = !dataActionActiveObj?.dataActionTable && prevCurConfig?.id !== newCurConfig?.id
    const tableOptionChange = prevCurConfig?.id === newCurConfig?.id && optionChangeFlag
    if (tabChange || tableOptionChange) {
      this.updatingTable = true
      this.setState(
        {
          searchText: '',
          isShowSuggestion: false,
          tableShowColumns: undefined,
          selectQueryFlag: false
        },
        () => {
          // reset ds query
          dsAvailable && dataSource?.updateQueryParams(EMPTY_QUERY_PARAMS, id)
          this.destoryTable().then(() => {
            this.createTable()
          })
        }
      )
      return
    }
    // data-action: view in table
    if (dataActionActiveObj?.dataActionTable && this.dataActionCanLoad && !this.updatingTable) {
      this.dataActionCanLoad = false
      this.props.dispatch(
        appActions.widgetStatePropChange(id, 'dataActionActiveObj', { activeTabId: newActiveTabId, dataActionTable: false })
      )
      this.updatingTable = true
      this.setState(
        {
          activeTabId: newActiveTabId,
          searchText: '',
          tableShowColumns: undefined
        },
        () => {
          // reset ds query
          dsAvailable && dataSource?.updateQueryParams(EMPTY_QUERY_PARAMS, id)
          this.destoryTable().then(() => {
            this.createTable()
          })
        }
      )
    }
  }

  // deal with runtime update caused by setting change
  onSettingChangeRuntime = () => {
    const { id } = this.props
    const optionChangeSuggestion = this.props?.stateProps?.optionChangeSuggestion || false
    const removeLayerFlag = this.props?.stateProps?.removeLayerFlag || false
    if (optionChangeSuggestion) {
      this.setState({ isShowSuggestion: false })
      this.props.dispatch(
        appActions.widgetStatePropChange(id, 'optionChangeSuggestion', false)
      )
    }
    if (removeLayerFlag) {
      const popover = document.getElementsByClassName(
        'esri-popover esri-popover--open'
      )
      if (popover && popover.length > 0) popover[0].remove()
      this.props.dispatch(
        appActions.widgetStatePropChange(id, 'removeLayerFlag', false)
      )
    }
  }

  // view-in-table filter change
  onFilterChange = (newActiveTabId: string) => {
    const { dataSource, activeTabId } = this.state
    const { viewInTableObj } = this.props
    if (viewInTableObj && activeTabId === newActiveTabId) {
      const viewInTableIds = Object.keys(viewInTableObj)
      const currentTabViewTableIndex = viewInTableIds.findIndex(a => a === newActiveTabId)
      if (currentTabViewTableIndex > -1) {
        const activeViewDs = viewInTableObj[newActiveTabId].daLayerItem.dataActionDataSource
        const activeUseDs = viewInTableObj[newActiveTabId].daLayerItem.useDataSource
        let dsParam: any
        if (activeViewDs) {
          dsParam = (activeViewDs as QueriableDataSource).getCurrentQueryParams()
        } else if (activeUseDs && dataSource) {
          dsParam = dataSource.getCurrentQueryParams()
        }
        const orgExpression = this.table?.layer?.definitionExpression
        if (orgExpression !== undefined && orgExpression !== dsParam?.where) {
          this.table.layer.definitionExpression = dsParam?.where
        }
      }
    }
  }

  // setting options change
  settingOptionsChange = (prevCurConfig: LayersConfig, newCurConfig: LayersConfig): boolean => {
    let optionChangeFlag = false
    if (prevCurConfig?.id !== newCurConfig?.id) return optionChangeFlag
    const optionKeys = [
      'enableAttachements',
      'enableEdit',
      'allowCsv',
      'enableSelect',
      'selectMode',
      'tableFields'
    ]
    const referenceTypeKeys = ['tableFields']
    for (const item of optionKeys) {
      const changeFlag = referenceTypeKeys.includes(item) ? !lodash.isDeepEqual(prevCurConfig?.[item], newCurConfig?.[item]) : (prevCurConfig?.[item] !== newCurConfig?.[item])
      if (changeFlag) {
        optionChangeFlag = true
        break
      }
    }
    return optionChangeFlag
  }

  getFieldsFromDatasource = () => {
    const { config } = this.props
    const { layersConfig } = config
    const { activeTabId } = this.state
    const daLayersConfig = this.getDataActionTable()
    const allLayersConfig = layersConfig.asMutable({ deep: true }).concat(daLayersConfig)
    const curLayer = allLayersConfig
      .find(item => item.id === activeTabId)
    // 'allFields' need recalculate(chart output ds), if dataActionDataSource exists, use it
    const selectedDs = curLayer?.dataActionDataSource || this.dsManager.getDataSource(curLayer.useDataSource?.dataSourceId)
    const allFieldsSchema = selectedDs?.getSchema()
    const allFields = allFieldsSchema?.fields ? Object.values(allFieldsSchema?.fields) : []
    const defaultInvisible = [
      'CreationDate',
      'Creator',
      'EditDate',
      'Editor',
      'GlobalID'
    ]
    let tableFields = allFields.filter(
      item => !defaultInvisible.includes(item.jimuName)
    )
    // If there are too many columns, only the first 50 columns will be displayed by default
    if (tableFields?.length > 50) {
      tableFields = tableFields.slice(0, 50)
    }
    return { allFields, tableFields }
  }

  onToolStyleChange = (width: number, height: number) => {
    width < TABLE_BREAK_POINTS
      ? this.setState({ mobileFlag: true })
      : this.setState({ mobileFlag: false })
    width < SEARCH_TOOL_MIN_SIZE
      ? this.setState({ searchToolFlag: true })
      : this.setState({ searchToolFlag: false })
    this.setState({ widgetWidth: width })
  }

  onDataSourceCreated = (dataSource: QueriableDataSource): void => {
    this.setState({ dataSource })
    const isSelectionView = dataSource?.dataViewId === SELECTION_DATA_VIEW_ID
    // The first time you switch a TAB and the target TAB is using dataView, the ds changes after the update
    const isDataView = dataSource?.dataViewId && dataSource?.dataViewId !== 'output' && !isSelectionView
    const hasNoSelectionView = !!dataSource.getMainDataSource().getDataView(DATA_VIEW_ID_FOR_NO_SELECTION)
    const dsChangeCreateTable = !this.updatingTable && ((isSelectionView && hasNoSelectionView) || isDataView)
    if (dsChangeCreateTable) {
      this.updatingTable = true
      this.destoryTable().then(() => {
        this.createTable(dataSource)
      })
    }
  }

  updateGeometryAndSql = (dataSource: QueriableDataSource) => {
    if (!this.table?.layer) return
    const dsParam: any = dataSource?.getCurrentQueryParams()
    const orgExpression = this.table.layer.definitionExpression
    const isDefaultExpression = orgExpression === '' && dsParam?.where === '1=1'
    if (!isDefaultExpression && orgExpression !== dsParam?.where) {
      this.table.layer.definitionExpression = dsParam?.where
    }
    dataSourceUtils.changeJimuFeatureLayerQueryToJSAPILayerQuery(dataSource as FeatureLayerDataSource, Immutable(dsParam)).then(res => {
      if (!res) return
      const { geometry, distance, units } = res
      if (!geometry) return
      const sr = geometry?.spatialReference
      const geometryType = (geometry as __esri.Geometry)?.type
      const { isWGS84, isWebMercator } = sr as __esri.SpatialReference
      const useBufferMethod = (isWGS84 || isWebMercator) ? this.geometryEngine.geodesicBuffer : this.geometryEngine.buffer
      const orgGeometryJson = (this.table?.filterGeometry as any)?.toJSON()
      if (geometryType !== 'polygon' && distance && distance <= 0) {
        const emptyBuff = new this.Polygon({ rings: [] })
        if (!lodash.isDeepEqual(orgGeometryJson, emptyBuff?.toJSON())) {
          (this.table.filterGeometry as any) = emptyBuff
        }
      } else if (distance && units) {
        const geometryBuff = useBufferMethod(geometry as any, distance, units as any)
        if (!lodash.isDeepEqual(orgGeometryJson, (geometryBuff as __esri.Polygon)?.toJSON())) {
          (this.table.filterGeometry as any) = geometryBuff
        }
      } else { // only extent change
        (this.table.filterGeometry as any) = geometry
      }
    })
    setTimeout(() => {
      this.asyncSelectedRebuild(dataSource)
    }, 500)
  }

  onDataSourceInfoChange = (
    info: IMDataSourceInfo,
    preInfo?: IMDataSourceInfo
  ) => {
    if (!info) {
      this.destoryTable().then(() => {
        this.setState({ emptyTable: true })
      })
      return
    }
    this.dataSourceChange = true
    if (info?.status === DataSourceStatus.Loaded && preInfo?.status === DataSourceStatus.Loaded) {
      this.dataSourceChange = false
    }
    let { dataSource } = this.state
    const { selectQueryFlag, activeTabId, selfDsChange } = this.state
    const { config } = this.props
    const { layersConfig } = config
    const daLayersConfig = this.getDataActionTable()
    const allLayersConfig = layersConfig.asMutable({ deep: true }).concat(daLayersConfig)
    const curLayer = allLayersConfig.find(item => item.id === activeTabId)
    const useDS = curLayer?.useDataSource
    // If other widgets load data, status will be loaded at the first time
    // This time state.dataSource is undefined
    if ((!dataSource && useDS) || (dataSource?.id !== useDS?.dataSourceId)) {
      dataSource = this.dsManager.getDataSource(useDS?.dataSourceId) as QueriableDataSource
      if (!dataSource) {
        this.setState({ emptyTable: true })
        return
      }
    } else if (!dataSource && !useDS) {
      return
    }
    // selection view: status is loaded, but if there is no selection, it should be an empty table
    const isEmptySelectionView = dataSource?.dataViewId === SELECTION_DATA_VIEW_ID && dataSource?.getSourceRecords()?.length === 0
    if (!curLayer.dataActionObject) {
      if (!info?.status || info?.status === DataSourceStatus.NotReady || isEmptySelectionView) {
        this.destoryTable().then(() => {
          this.setState({ notReady: true, emptyTable: true })
        })
        return
      } else {
        this.setState({ notReady: false, emptyTable: false })
      }
    }
    // loading status
    const showLoading = this.getLoadingStatus(dataSource, info?.status)
    const interval = dataSource?.getAutoRefreshInterval() || 0
    // toggle auto refresh loading status
    this.toggleAutoRefreshLoading(dataSource, showLoading, interval)
    this.setState({ showLoading, interval })
    // shielding info change
    const preSelectedIds = preInfo?.selectedIds
    const newSelectedIds = info?.selectedIds
    const preSourceVersion = preInfo?.sourceVersion
    const newSourceVersion = info?.sourceVersion
    const newVersion = info?.gdbVersion
    const preVersion = preInfo?.gdbVersion
    const newClientVersion = info?.version
    const preClientVersion = preInfo?.version
    const infoStatusNotChange =
      curLayer?.useDataSource?.dataSourceId === dataSource?.id &&
      preInfo?.status === info?.status &&
      preInfo?.instanceStatus === info?.instanceStatus &&
      info?.widgetQueries === preInfo?.widgetQueries &&
      preSelectedIds === newSelectedIds &&
      // If the version change is caused by the table's own modifications, do not renrender
      (preSourceVersion === newSourceVersion || newSourceVersion === this.tableSourceVersion + 1) &&
      newVersion === preVersion
    if (
      notLoad.includes(info?.status) ||
      this.updatingTable ||
      infoStatusNotChange
    ) { return }
    // update ds selection (data-action）
    this.setState({ selectRecords: dataSource?.getSelectedRecords() })
    // ds ready create table and selected features change
    const sourceVersionChange = newSourceVersion !== preSourceVersion
    const clientVersionChange = newClientVersion !== preClientVersion
    const tabChange = curLayer?.useDataSource?.dataSourceId !== dataSource?.id
    const outputReapply = (!preInfo?.status || notLoad.includes(preInfo?.status)) && info && !notLoad.includes(info?.status) && info?.instanceStatus !== DataSourceStatus.NotCreated
    const selectedChange = preSelectedIds !== newSelectedIds && (preSelectedIds?.length !== 0 || newSelectedIds?.length !== 0)
    const infoNotChange = info?.status === preInfo?.status && info?.instanceStatus === preInfo?.instanceStatus
    const isOutputDs = dataSource?.getDataSourceJson()?.isOutputFromWidget
    const dsCreated = !curLayer.dataActionObject && info?.status === DataSourceStatus.Unloaded && info?.instanceStatus === DataSourceStatus.Created &&
      !selectedChange && !infoNotChange && !isOutputDs
    if (outputReapply || tabChange || dsCreated || sourceVersionChange || clientVersionChange) {
      if (curLayer?.dataActionObject) return
      if (!this.dataActionCanLoad) return
      this.updatingTable = true
      this.destoryTable().then(() => {
        this.createTable(dataSource)
      })
      return
    }
    // async click selected
    // Action table does not need to be selected synchronously
    if (!curLayer.dataActionObject && preSelectedIds !== newSelectedIds) {
      if (selectQueryFlag) {
        this.asyncSelectedWhenSelection(newSelectedIds || Immutable([]))
        setTimeout(() => {
          this.asyncSelectedRebuild(dataSource)
        }, 500)
      } else {
        if (selfDsChange) {
          this.setState({ selfDsChange: false })
        } else {
          setTimeout(() => {
            this.asyncSelectedRebuild(dataSource)
          }, 500)
        }
      }
    }
  }

  compareAndUpdateTable = (curDsQueryInfo, preDsQueryInfo, isBelongto?: boolean) => {
    const { dataSource, activeTabId } = this.state
    const { config } = this.props
    const { layersConfig } = config
    const daLayersConfig = this.getDataActionTable()
    const allLayersConfig = layersConfig.asMutable({ deep: true }).concat(daLayersConfig)
    const curLayer = allLayersConfig.find(item => item.id === activeTabId)
    const { widgetQueries: preWidgetQueries, gdbVersion: preGdbVersion, sourceVersion: presSourceVersion } = preDsQueryInfo
    const { widgetQueries, gdbVersion, needRefresh, sourceVersion } = curDsQueryInfo
    const gdbVersionChange = preGdbVersion && gdbVersion && gdbVersion !== preGdbVersion && this.table
    const widgetQueryChange = !curLayer.dataActionObject && widgetQueries !== preWidgetQueries
    const belongtoSourceVersionChange = isBelongto && presSourceVersion !== sourceVersion
    // gdbVersion/sourceVersion change & auto refresh
    if (gdbVersionChange) {
      const tableLayer: any = this.table.layer
      tableLayer.gdbVersion = gdbVersion
      this.onTableRefresh()
      return
    } else if (needRefresh) {
      this.onTableRefresh()
      return
    }
    // belongto ds sourceVersion change(can't get sql change with getCurrentQueryParams)
    if (belongtoSourceVersionChange) {
      this.updatingTable = true
      this.destoryTable().then(() => {
        this.createTable()
      })
      return
    }
    // widgetQuery change
    if (widgetQueryChange) {
      this.updateGeometryAndSql(dataSource)
    }
  }

  onQueryRequired = (queryRequiredInfo: QueryRequiredInfo, preQueryRequiredInfo?: QueryRequiredInfo) => {
    const { dataSource } = this.state
    const isDataActionTable = this.props?.stateProps?.dataActionActiveObj?.dataActionTable
    if (isDataActionTable || !preQueryRequiredInfo) return
    const dataSourceId = dataSource?.id
    // time extent change
    const dsParam: any = dataSource?.getCurrentQueryParams()
    const time = dsParam?.time
    if (time) {
      const apiTime = dataSourceUtils.changeJimuTimeToJSAPITimeExtent(time)
      const tableLayer = this.table?.layer as any
      const orgTimeExtent = tableLayer?.timeExtent
      const timeNotChnage = time?.[0] === orgTimeExtent?.start?.getTime() && time?.[1] === orgTimeExtent?.end?.getTime()
      if (!timeNotChnage && tableLayer) tableLayer.timeExtent = apiTime
    }
    // ds/belongtoDs info
    const curDsRequiredInfo = queryRequiredInfo?.[dataSourceId]
    const preDsRequiredInfo = preQueryRequiredInfo?.[dataSourceId]
    const belongtoDsId = dataSource?.belongToDataSource?.id
    const curBelongtoDsInfo = queryRequiredInfo?.[belongtoDsId]
    const preBelongtoDsInfo = preQueryRequiredInfo?.[belongtoDsId]
    if (!curDsRequiredInfo && !curBelongtoDsInfo) return
    // belongToDataSource info change
    if (curBelongtoDsInfo) {
      this.compareAndUpdateTable(curBelongtoDsInfo, preBelongtoDsInfo, true)
      return
    }
    // dataSource info change
    this.compareAndUpdateTable(curDsRequiredInfo, preDsRequiredInfo)
  }

  getLayerObjectIdField = () => {
    const { dataSource } = this.state
    const objectIdField =
      this.table?.layer?.objectIdField ||
      (dataSource as FeatureLayerDataSource)?.layer?.objectIdField ||
      'OBJECTID'
    return objectIdField
  }

  asyncSelectedWhenSelection = (newSelectedIds: ImmutableArray<string>) => {
    const { dataSource } = this.state
    const objectIdField = this.getLayerObjectIdField()
    const curQuery: any = dataSource && dataSource.getCurrentQueryParams()
    let legal = true
    newSelectedIds.forEach(id => {
      if (!id) legal = false
    })
    const selectedQuery = (newSelectedIds.length > 0 && legal)
      ? `${objectIdField} IN (${newSelectedIds
      .map(id => {
        return id
      })
      .join()})`
      : curQuery.where
    if (this.table && this.table.layer) {
      this.table.clearSelectionFilter()
      this.table.layer.definitionExpression = selectedQuery
    }
  }

  getFeatureLayer = (dataSource: QueriableDataSource, dataRecords?: DataRecord[]) => {
    const ds = dataSource as FeatureLayerDataSource
    const notToLoad = dataSource?.getDataSourceJson()?.isDataInDataSourceInstance
    let featureLayer
    if (dataRecords?.length > 0) {
      return dataSourceUtils.createFeatureLayerByRecords(ds, dataRecords as FeatureDataRecord[])
    } else {
      const curQuery: any = dataSource && dataSource.getCurrentQueryParams()
      if (notToLoad) {
        const q: FeatureLayerQueryParams = { returnGeometry: true }
        // Current data source is selection view and selection view is empty indicate that widget is actually using no_selection now.
        const usingNoSelectionView = ds.dataViewId === CONSTANTS.SELECTION_DATA_VIEW_ID && (!(ds as any).sourceRecords || (ds as any).sourceRecords.length === 0)
        // If widget is using no_selection view, should use pageSize of the no_selection view to load records.
        if (usingNoSelectionView) {
          const noSelectionView = ds.getMainDataSource().getDataView(CONSTANTS.DATA_VIEW_ID_FOR_NO_SELECTION)
          if (noSelectionView) {
            q.pageSize = ds.getMainDataSource().getDataSourceJson()?.dataViews?.[CONSTANTS.DATA_VIEW_ID_FOR_NO_SELECTION]?.pageSize
          }
        }
        // chart output and selected features need load
        return ds.query(q).then(async ({ records }) => {
          const dataRecords = await Promise.resolve(records) as FeatureDataRecord[]
          return dataSourceUtils.createFeatureLayerByRecords(ds, dataRecords)
        })
      }
      // Adjust the order, because ds.layer is a reference type that changes the original data
      // csv upload type ds: only have layer, but not itemId and url
      if (!this.FeatureLayer) return Promise.resolve(featureLayer)
      if (ds.itemId) {
        const layerId = parseInt(ds.layerId)
        const layerConfig = {
          portalItem: {
            id: ds.itemId,
            portal: {
              url: ds.portalUrl
            }
          },
          definitionExpression: curQuery.where,
          layerId: layerId || undefined
        }
        if (ds.url) (layerConfig as any).url = ds.url
        featureLayer = new this.FeatureLayer(layerConfig)
      } else if (ds.url) {
        featureLayer = new this.FeatureLayer({
          definitionExpression: curQuery.where,
          url: ds.url
        })
      } else if (ds.layer) {
        // The original method of creating a layer by querying records will lose
        // the data in ds when the filter is set first and then view in table.
        return ds?.createJSAPILayerByDataSource().then(layer => {
          return layer
        })
      } else {
        return Promise.resolve(featureLayer)
      }
    }
    if (notToLoad) { // output ds (dynamic layer, load will rise bug)
      return Promise.resolve(featureLayer)
    } else { // need load to get layer.capabilities
      return featureLayer.load().then(async () => {
        return await Promise.resolve(featureLayer)
      })
    }
  }

  getDsAccessibleInfo = (url: string) => {
    if (!url) return Promise.resolve(false)
    const request = esri.restRequest.request
    return request(`${url}?f=json`).then(info => {
      if (Object.keys(info).includes('error')) {
        return false
      } else {
        return true
      }
    }).catch(err => {
      return false
    })
  }

  getFieldEditable = (layerDefinition, jimuName: string) => {
    const fieldsConfig = layerDefinition?.fields || []
    const orgField = fieldsConfig.find(config => config.name === jimuName)
    const fieldEditable = orgField ? orgField?.editable : true
    return fieldEditable
  }

  dsAsyncSelectTable = (dataSource, selectedItems: DataRecord[] | number[], rowClick: boolean, versionChangeClear?: boolean) => {
    const { id } = this.props
    const tableInstance = this.table as any
    const objectIdField = this.getLayerObjectIdField()
    const selectedQuery =
      selectedItems && selectedItems.length > 0
        ? `${objectIdField} IN (${selectedItems
            .map(item => {
              if (item.dataSource) {
                return item.getId()
              } else {
                return item
              }
            })
            .join()})`
        : '1=2'
    if (versionChangeClear) dataSource.clearSelection()
    dataSource
      .query({
        where: selectedQuery,
        returnGeometry: true
      } as QueryParams)
      .then(result => {
        const records = result?.records
        if (records) {
          MessageManager.getInstance().publishMessage(
            new DataRecordsSelectionChangeMessage(id, result.records)
          )
          tableInstance.layer.queryFeatureCount().then(count => {
            count === 0 ? this.setState({ emptyData: true }) : this.setState({ emptyData: false })
          })
          if (records.length > 0) {
            dataSource.selectRecordsByIds(
              records.map(record => record.getId()),
              records
            )
          } else {
            dataSource.clearSelection()
          }
          if (!rowClick) {
            setTimeout(() => {
              this.asyncSelectedRebuild(dataSource)
            }, 500)
          }
        }
      })
  }

  isDataSourceAccessible = (dataSourceId: string, isDataAction?: boolean, actionDataSource?: DataSource): boolean => {
    const hasInstance = !!this.dsManager.getDataSource(dataSourceId)
    let dataSourceIsInProps = false
    if (actionDataSource) {
      dataSourceIsInProps = true
    } else {
      dataSourceIsInProps = isDataAction ? hasInstance : (this.props.useDataSources?.filter(useDs => dataSourceId === useDs.dataSourceId).length > 0)
    }
    return dataSourceIsInProps
  }

  resetUpdatingStatus = (emptyTable: boolean = false) => {
    this.dataSourceChange = false
    this.dataActionCanLoad = true
    this.updatingTable = false
    this.setState({ emptyTable })
  }

  getDsCapabilities = (capabilities: string, capType: string): boolean => {
    if (capabilities) {
      return Array.isArray(capabilities)
        ? capabilities?.join().toLowerCase().includes(capType)
        : capabilities?.toLowerCase().includes(capType)
    } else {
      return false
    }
  }

  getLayerAndNewTable = (dataSource: QueriableDataSource, curLayerConfig: LayersConfig, dataRecords: DataRecord[]) => {
    const { tableShowColumns, selectQueryFlag } = this.state
    const { id } = this.props
    const newId = this.currentRequestId + 1
    this.currentRequestId++
    const isSceneLayer = dataSource?.type === AllDataSourceTypes.SceneLayer
    const dataSourceUsed = isSceneLayer ? (dataSource as SceneLayerDataSource).getAssociatedDataSource() : dataSource
    if (dataSourceUsed) {
      const getPrivilege = () => {
        return privilegeUtils.checkExbAccess(privilegeUtils.CheckTarget.Experience).then(exbAccess => {
          return curLayerConfig.enableEdit && exbAccess?.capabilities?.canEditFeature
        })
      }
      const tablePromise = cancelablePromise.cancelable(this.getFeatureLayer(dataSourceUsed, dataRecords).then(async layer => {
        if (newId !== this.currentRequestId || !layer || !this.FeatureTable || !this.refs.currentEl || !this.refs.tableContainer || !document) {
          this.resetUpdatingStatus()
          return
        }
        const featureLayer = layer?.layer || layer
        // fetch to confirm whether it's a public source
        const accessible = await this.getDsAccessibleInfo(layer?.url)
        // use exb privilege instead of api's supportsUpdateByOthers
        const privilegeEditable = await getPrivilege()
        // if it's not public, use 'privilegeEditable'
        const editable = curLayerConfig.enableEdit && (accessible || privilegeEditable)
        // fieldConfigs: Priority needs to be considered for 'editable'
        const allFieldsSchema = (dataSourceUsed as DataSource)?.getSchema()
        // sort fields
        const queryParams = dataSource?.getCurrentQueryParams()
        const sortFieldsArray = (queryParams as any)?.orderByFields || []
        const sortFields = {}
        sortFieldsArray.forEach((item, index) => {
          const fieldSort = item.split(' ')
          sortFields[fieldSort[0]] = { direction: fieldSort[1]?.toLowerCase(), initialSortPriority: index }
        })
        // construct tableTemplate
        const layerDefinition = (dataSource as FeatureLayerDataSource)?.getLayerDefinition()
        const { allFields } = this.getFieldsFromDatasource()
        const curColumns = tableShowColumns ? tableShowColumns.map(col => { return { jimuName: col.value } }) : curLayerConfig.tableFields.filter(item => item.visible)
        const invisibleColumns = minusArray(allFields, curColumns).map(item => {
          return item.jimuName
        })
        const tableTemplate = new this.TableTemplate({
          columnTemplates: curLayerConfig.tableFields.map(item => {
            const itemKey = item.jimuName || item.name
            const newItem = allFieldsSchema?.fields?.[itemKey]
            return {
              fieldName: itemKey,
              label: newItem?.alias,
              ...(editable ? { editable: this.getFieldEditable(layerDefinition, itemKey) && item?.editAuthority } : {}),
              visible: invisibleColumns.indexOf(itemKey) < 0,
              ...(sortFields[itemKey] ? sortFields[itemKey] : {})
            }
          })
        })
        // check layer capabilities for delete operation
        const capabilities = layerDefinition?.capabilities
        const deletable = this.getDsCapabilities(capabilities, 'delete')
        this.setState({ notAllowDel: !deletable })
        // when unselect all fields, do not render table
        if (tableTemplate?.columnTemplates?.length === 0) {
          this.resetUpdatingStatus()
          return
        }
        if (editable) {
          // eslint-disable-next-line
          const that = this
          featureLayer.on('edits', function (event) {
            const { addedFeatures, updatedFeatures, deletedFeatures } = event
            // There is no 'add' in api for now
            const adds = addedFeatures && addedFeatures.length > 0
            const updates = updatedFeatures && updatedFeatures.length > 0
            const deletes = deletedFeatures && deletedFeatures.length > 0
            if (adds || updates || deletes) {
              const updateFeature = event?.edits?.updateFeatures?.[0]
              if (updateFeature) {
                const record = dataSource.buildRecord(updateFeature)
                const dsInfo = dataSource.getInfo()
                that.tableSourceVersion = dsInfo?.sourceVersion ?? 0
                dataSource.afterUpdateRecord(record)
              }
            }
          })
        }
        const dsGdbVersion = (dataSource as FeatureLayerDataSource).getGDBVersion()
        if (dsGdbVersion) featureLayer.gdbVersion = dsGdbVersion
        const timeExtent = (queryParams as any)?.time
        if (timeExtent) {
          const apiTime = dataSourceUtils.changeJimuTimeToJSAPITimeExtent(timeExtent)
          featureLayer.timeExtent = apiTime
        }
        // Clear table container before create new table.
        this.refs.tableContainer.innerHTML = ''
        const container = document.createElement('div')
        container.className = `table-container-${id}`
        this.refs.tableContainer.appendChild(container)
        this.table = new this.FeatureTable({
          layer: featureLayer,
          container: container,
          visibleElements: {
            header: true,
            menu: true,
            menuItems: {
              clearSelection: false,
              refreshData: false,
              toggleColumns: false
            },
            selectionColumn: false
          },
          menuConfig: {},
          tableTemplate,
          multiSortEnabled: true,
          attachmentsEnabled: curLayerConfig.enableAttachements,
          editingEnabled: editable
        })
        // for table total/selected count
        reactiveUtils.watch(() => (this.table?.viewModel as any)?.size, tableTotal => {
          this.setState({ tableTotal })
        })
        reactiveUtils.watch(() => this.table?.highlightIds?.length, tableSelected => {
          this.setState({ tableSelected })
        })
        // When table is not loaded, buttons in tool should be disabled
        reactiveUtils.watch(() => this.table.state, (tableState) => {
          if (tableState === 'loaded') {
            this.setState({ tableLoaded: true })
          } else {
            this.setState({ tableLoaded: false })
          }
        })
        // async selected
        // Action table does not need to be selected synchronously
        const dataActionObject = curLayerConfig.dataActionObject
        if (!dataActionObject) {
          setTimeout(() => {
            if (selectQueryFlag) this.asyncSelectedWhenSelection(Immutable(dataSource.getSelectedRecordIds() || []))
          }, 500)
        }
        const tableInstance = this.table as any
        // Because the api does not handle the bubbling of double-click events, double-clicking a line to
        // start editing results in selecting and then canceling, so the deferred canceling method is used
        if (curLayerConfig.enableSelect) {
          const rowClickFn = ({ context, native }) => {
            // edit mode cancel row-click
            const clickEditTag = native?.path?.[0]?.nodeName || native?.path?.[0]?.tagName
            if (clickEditTag === 'INPUT' || clickEditTag === 'SELECT') return
            // Delay click function
            clearTimeout(this.timerFn)
            this.timerFn = setTimeout(() => {
              this.setState({ selfDsChange: true })
              const objectId = context.item.objectId
              if (curLayerConfig.selectMode === SelectionModeType.Single) {
                this.table.highlightIds.removeAll()
              }
              context.selected
                ? this.table.highlightIds.remove(objectId)
                : this.table.highlightIds.add(objectId)
              const selectedIds = tableInstance.grid?.highlightIds?.toArray()
              if (selectedIds?.length === 0) {
                if (this.state.selectQueryFlag) this.table.clearSelectionFilter()
                this.resetTableExpression()
                this.setState({ selectQueryFlag: false })
              }
              this.dsAsyncSelectTable(dataSource, selectedIds, true)
            }, 200)
          }
          tableInstance.grid.on('row-click', rowClickFn)
        }
        // dblclick cancel click event
        tableInstance?.domNode?.addEventListener('dblclick', eve => {
          clearTimeout(this.timerFn)
        })
        if (!dataRecords) this.updateGeometryAndSql(dataSource)
        this.resetUpdatingStatus()
      }))
      // cancel previous promise
      if (this.promises.length !== 0) {
        this.promises.forEach(p => { p.cancel() })
      }
      this.promises.push(tablePromise)
    }
  }

  createTable = (newDataSource?) => {
    const { config } = this.props
    const { layersConfig } = config
    const { activeTabId } = this.state
    let { dataSource } = this.state
    if (newDataSource) dataSource = newDataSource
    // add data-action table config to all configs
    const daLayersConfig = this.getDataActionTable()
    const allLayersConfig = layersConfig.asMutable({ deep: true }).concat(daLayersConfig)
    const curLayerConfig = allLayersConfig.find(item => item.id === activeTabId)
    if (!curLayerConfig) {
      this.dataActionCanLoad = true
      this.updatingTable = false
      return
    }
    // add data widget data action
    const { dataActionDataSource } = curLayerConfig
    if (dataActionDataSource) {
      dataSource = dataActionDataSource as QueriableDataSource
    }
    if (!dataSource || notLoad.includes(dataSource?.getInfo()?.status)) {
      this.dataActionCanLoad = true
      this.updatingTable = false
      return
    }
    // ds judgment
    if (dataSource?.dataViewId === SELECTION_DATA_VIEW_ID) {
      if (!dataSource?.getDataSourceJson()?.isDataInDataSourceInstance ||
        dataSource?.getSourceRecords().length === 0
      ) {
        this.resetUpdatingStatus(true)
        return
      } else {
        this.setState({ emptyTable: false })
      }
    }
    // Determine whether the ds has change to curLayer's ds
    const dataActionObject = curLayerConfig.dataActionObject
    const curDsId = dataActionDataSource ? dataActionDataSource?.id : curLayerConfig?.useDataSource?.dataSourceId
    const isCurDs = curDsId === dataSource?.id
    if (!isCurDs) {
      this.dataActionCanLoad = true
      this.updatingTable = false
      return
    }
    // Check whether ds is available
    if (!this.isDataSourceAccessible(curDsId, dataActionObject, dataActionDataSource)) {
      this.resetUpdatingStatus(true)
      return
    }
    const dataRecords = this.dataActionTableRecords[curLayerConfig.id]
    if (dataActionObject) {
      if (curDsId) {
        dataSource = this.dsManager.getDataSource(curDsId) as QueriableDataSource
      }
    }
    this.getLayerAndNewTable(dataSource, curLayerConfig, dataRecords)
  }

  asyncSelectedRebuild = (dataSource: QueriableDataSource) => {
    const selectedRecordIds = dataSource?.getSelectedRecordIds()
    this.table?.highlightIds?.removeAll && this.table.highlightIds.removeAll()
    // Synchronize new selection (the record of selectedRecords has different structure)
    // layer/url ds: the featuresArray's structure is not match the 'deselectRows', use primary id
    if (selectedRecordIds?.length > 0) {
      selectedRecordIds.forEach(recordId => {
        if (recordId) this.table?.highlightIds?.add && this.table.highlightIds.add(parseInt(recordId))
      })
    }
  }

  async destoryTable () {
    if (this.table) {
      (this.table as any).menu.open = false
      !this.table.destroyed && this.table.destroy()
    }
    // Clear table container after destroy table.
    if (this.refs.tableContainer) {
      this.refs.tableContainer.innerHTML = ''
    }
    await Promise.resolve()
  }

  formatMessage = (id: string, values?: { [key: string]: any }) => {
    return this.props.intl.formatMessage(
      { id: id, defaultMessage: messages[id] },
      values
    )
  }

  onTagClick = (dataSourceId: string) => {
    const { id } = this.props
    this.setState({
      activeTabId: dataSourceId,
      selectQueryFlag: false,
      tableShowColumns: undefined,
      tableSelected: 0
    })
    this.props.dispatch(
      appActions.widgetStatePropChange(id, 'activeTabId', dataSourceId)
    )
  }

  handleTagChange = evt => {
    const dataSourceId = evt?.target?.value
    const { id } = this.props
    this.setState({
      activeTabId: dataSourceId,
      selectQueryFlag: false,
      tableSelected: 0
    })
    this.props.dispatch(
      appActions.widgetStatePropChange(id, 'activeTabId', dataSourceId)
    )
  }

  onShowSelection = () => {
    const { selectQueryFlag } = this.state
    if (selectQueryFlag) {
      this.table.clearSelectionFilter()
      this.resetTableExpression()
    } else {
      this.table.filterBySelection()
    }
    this.setState({ selectQueryFlag: !selectQueryFlag })
  }

  resetTableExpression = () => {
    const { dataSource } = this.state
    if (this.table?.layer) {
      const curQuery: any = dataSource && dataSource.getCurrentQueryParams()
      this.table.layer.definitionExpression = curQuery.where
    }
  }

  resetTable = () => {
    const { id } = this.props
    const { selectQueryFlag, dataSource } = this.state
    if (selectQueryFlag) {
      // reset sql
      this.resetTableExpression()
      this.setState({
        selectQueryFlag: false,
        selfDsChange: true
      })
    }
    MessageManager.getInstance().publishMessage(
      new DataRecordsSelectionChangeMessage(id, [])
    )
    setTimeout(() => {
      this.setState({ searchText: '' })
      dataSource.clearSelection()
      dataSource.updateQueryParams(EMPTY_QUERY_PARAMS, id)
      this.table && this.table.highlightIds.removeAll()
      this.table && this.table.clearSelectionFilter()
    }, 500)
  }

  onSelectionClear = () => {
    this.resetTable()
  }

  onTableRefresh = () => {
    this.table && this.table.refresh()
  }

  onDeleteSelection = () => {
    this.table && this.table.deleteSelection(true)
  }

  getQueryOptions = (curLayer: LayersConfig) => {
    let where = '1=1'
    let sqlExpression = null
    const { useDataSources } = this.props
    const { searchText, dataSource } = this.state
    const useDS = useDataSources && useDataSources[0]
    if (!dataSource || !useDS) return null
    // not queryiable data source, return
    if (!(dataSource).query) {
      return null
    }
    if (searchText && curLayer.enableSearch && curLayer.searchFields) {
      const result = dataSourceUtils.getSQL(searchText, curLayer.searchFields, dataSource, curLayer?.searchExact)
      where = result.sql
      sqlExpression = result
    }
    return { where, sqlExpression }
  }

  handleChange = (searchText: string) => {
    if (!searchText) {
      this.setState({ searchText, isShowSuggestion: false, searchSuggestion: [] }, () => {
        this.handleSubmit()
      })
    } else {
      this.setState({ searchText, isShowSuggestion: searchText?.length > 2 }, () => {
        clearTimeout(this.suggestionsQueryTimeout)
        this.suggestionsQueryTimeout = setTimeout(() => {
          this.getSearchSuggestions(searchText)
        }, 200)
      })
    }
  }

  getSearchSuggestions = (searchText: string) => {
    const { config } = this.props
    const { dataSource, activeTabId } = this.state
    if (searchText?.length < 3) {
      return false
    }
    const curLayer = config.layersConfig?.find(
      item => item.id === activeTabId
    )
    fetchSuggestionRecords(searchText, curLayer, dataSource).then(
      searchSuggestion => {
        this.setState({ searchSuggestion })
      }
    )
  }

  handleSubmit = () => {
    const { dataSource } = this.state
    const { id } = this.props
    const curLayer = this.props.config.layersConfig.find(
      item => item.id === this.state.activeTabId
    )
    const tableQuery = this.getQueryOptions(curLayer)
    dataSource.updateQueryParams(tableQuery as QueryParams, id)
  }

  onKeyUp = evt => {
    if (!evt || !evt.target) return
    if (evt.key === 'Enter') {
      this.setState({ isShowSuggestion: false }, () => {
        this.handleSubmit()
      })
    }
  }

  getTextInputPrefixElement = () => {
    const { theme } = this.props
    return (
      <Button
        type='tertiary'
        icon
        size='sm'
        onClick={evt => {
          this.setState({
            isShowSuggestion: false
          }, () => {
            this.handleSubmit()
          })
        }}
        className='search-icon'
      >
        <SearchOutlined color={theme.colors.palette.light[800]} />
      </Button>
    )
  }

  renderSearchTools = (hint?: string) => {
    const { searchText, searchToolFlag, isOpenSearchPopper } = this.state
    const { theme } = this.props

    return (
      <div className='table-search-div'>
        {searchToolFlag
          ? (
            <div
              className='float-right'
              ref={ref => (this.refs.searchPopup = ref)}
            >
              <Button
                type='tertiary'
                icon
                size='sm'
                className='tools-menu'
                title={this.formatMessage('search')}
                onClick={evt => {
                  this.setState({ isOpenSearchPopper: !isOpenSearchPopper })
                }}
              >
                <SearchOutlined />
              </Button>
              <Popper
                placement='right-start'
                reference={this.refs.searchPopup}
                offset={[-10, -30]}
                open={isOpenSearchPopper}
                showArrow={false}
                toggle={e => {
                  this.setState({ isOpenSearchPopper: !isOpenSearchPopper })
                }}
              >
                <div className='d-flex align-items-center table-popup-search m-2'>
                  <Button
                    type='tertiary'
                    icon
                    size='sm'
                    onClick={evt => {
                      this.setState({ isOpenSearchPopper: false })
                    }}
                    className='search-back mr-1'
                  >
                    <ArrowLeftOutlined color={theme.colors.palette.dark[800]} />
                  </Button>
                  <TextInput
                    className='popup-search-input'
                    placeholder={hint || this.formatMessage('search')}
                    onChange={e => { this.handleChange(e.target.value) }}
                    value={searchText || ''}
                    onKeyDown={e => { this.onKeyUp(e) }}
                    prefix={this.getTextInputPrefixElement()}
                    allowClear
                    title={hint || this.formatMessage('search')}
                  />
                </div>
              </Popper>
            </div>
            )
          : (
            <div className='d-flex align-items-center table-search'>
              <TextInput
                className='search-input'
                placeholder={hint || this.formatMessage('search')}
                onChange={e => { this.handleChange(e.target.value) }}
                value={searchText || ''}
                onKeyDown={e => { this.onKeyUp(e) }}
                prefix={this.getTextInputPrefixElement()}
                allowClear
                title={hint || this.formatMessage('search')}
              />
            </div>
            )}
      </div>
    )
  }

  getInitFields = () => {
    const { activeTabId } = this.state
    const { config } = this.props
    const { layersConfig } = config
    // data-action Table
    const daLayersConfig = this.getDataActionTable()
    const allLayersConfig = layersConfig.asMutable({ deep: true }).concat(daLayersConfig)
    const curLayer = allLayersConfig.find(item => item.id === activeTabId)
    const { tableFields } = curLayer
    const initSelectTableFields = []
    for (const item of tableFields) {
      if (item.visible) initSelectTableFields.push({ value: item.name, label: item.alias })
    }
    return initSelectTableFields
  }

  onValueChangeFromRuntime = (valuePairs: ClauseValuePair[]) => {
    if (!valuePairs) valuePairs = []
    const { tableShowColumns } = this.state
    const initTableFields = this.getInitFields()
    const tableColumns = tableShowColumns || initTableFields
    const selectFlag = valuePairs.length > tableColumns.length
    minusArray(tableColumns, valuePairs, 'value').forEach(item => {
      selectFlag
        ? this.table.showColumn(item.value)
        : this.table.hideColumn(item.value)
    })
    this.setState({ tableShowColumns: valuePairs })
  }

  getDataActionTable = () => {
    const { viewInTableObj } = this.props
    const dataActionTableArray = []
    for (const key in viewInTableObj) {
      const tableObj = viewInTableObj[key]
      this.dataActionTableRecords[key] = tableObj.records
      dataActionTableArray.push({ ...tableObj.daLayerItem })
    }
    return dataActionTableArray
  }

  onCloseTab = (tabId: string, evt?) => {
    const { id, viewInTableObj } = this.props
    if (evt) evt.stopPropagation()
    this.removeConfig = true
    this.setState({ tableShowColumns: undefined })
    const newViewInTableObj = viewInTableObj
    delete newViewInTableObj[tabId]
    delete this.dataActionTableRecords[tabId]
    MutableStoreManager.getInstance().updateStateValue(id, 'viewInTableObj', newViewInTableObj)
  }

  getLoadingStatus = (ds?: QueriableDataSource, queryStatus?: DataSourceStatus) => {
    const { stateShowLoading: mustLoading } = this.props
    // loading
    let showLoading = false
    if (
      mustLoading ||
      window.jimuConfig.isInBuilder ||
      (ds && queryStatus === DataSourceStatus.Loading)
    ) {
      showLoading = true
    }
    return showLoading
  }

  setRefreshLoadingString = (showLoading = false) => {
    if (!showLoading) return false
    let time = 0
    // eslint-disable-next-line
    const _this = this
    clearInterval(this.autoRefreshLoadingTime)

    this.autoRefreshLoadingTime = setInterval(() => {
      time++
      _this.setState({
        autoRefreshLoadingString: _this.getLoadingString(time)
      })
    }, 60000)
  }

  getLoadingString = (time: number): string => {
    let loadingString = this.formatMessage('lastUpdateAFewTime')
    if (time > 1 && time <= 2) {
      loadingString = this.formatMessage('lastUpdateAMinute')
    } else if (time > 2) {
      loadingString = this.formatMessage('lastUpdateTime', { updateTime: time })
    }
    return loadingString
  }

  toggleAutoRefreshLoading = (ds: QueriableDataSource, showLoading: boolean, interval: number) => {
    this.resetAutoRefreshTimes(interval, showLoading)
    if (interval > 0) this.setRefreshLoadingString(showLoading)
  }

  resetAutoRefreshTimes = (interval: number, showLoading = false) => {
    // eslint-disable-next-line
    const _this = this
    clearTimeout(this.resetAutoRefreshTime)
    if (interval <= 0) clearInterval(this.autoRefreshLoadingTime)

    this.resetAutoRefreshTime = setTimeout(() => {
      if (showLoading && interval > 0) {
        _this.setState({
          autoRefreshLoadingString: _this.formatMessage('lastUpdateAFewTime')
        })
      }
      _this.setState({
        showLoading: showLoading
      })
    }, 0)
  }

  renderLoading = (showLoading: boolean, interval: number) => {
    const { autoRefreshLoadingString, mobileFlag, widgetWidth } = this.state
    const countContainerWidth = this.refs.countContainer?.clientWidth || 0
    const refreshMaxWidth = mobileFlag ? 20 : widgetWidth - countContainerWidth - 16
    return (
      <div className='position-absolute refresh-loading-con d-flex align-items-center' style={{ maxWidth: refreshMaxWidth }}>
        {showLoading && <div className='loading-con' />}
        {interval > 0 && (
          <div className='flex-grow-1 auto-refresh-loading text-truncate' title={!mobileFlag && autoRefreshLoadingString}>
            {mobileFlag
              ? <Tooltip title={autoRefreshLoadingString} showArrow placement='top-end'>
                <Button icon size='sm' type='tertiary' className='d-inline jimu-outline-inside border-0 p-0'>
                  <InfoOutlined size={14}/>
                </Button>
              </Tooltip>
              : autoRefreshLoadingString
            }
          </div>
        )}
      </div>
    )
  }

  renderTableCount = (tableTotal: number, tableSelected: number) => {
    const { mobileFlag, widgetWidth } = this.state
    const countMaxWidth = mobileFlag ? widgetWidth - 36 : widgetWidth / 2
    return (
      <div ref='countContainer' className='position-absolute table-count d-flex align-items-center' style={{ maxWidth: countMaxWidth }}>
        <div className='flex-grow-1 total-count-text text-truncate'>
          {this.formatMessage('tableCount', { total: tableTotal, selected: tableSelected })}
        </div>
      </div>
    )
  }

  onSuggestionConfirm = suggestion => {
    this.setState({
      searchText: suggestion,
      isShowSuggestion: false
    }, () => {
      this.handleSubmit()
    })
  }

  clearMessageAction = () => {
    MessageManager.getInstance().publishMessage(
      new DataRecordsSelectionChangeMessage(this.props.id, [])
    )
    this.setState({ emptyData: false })
  }

  customShowHideButton = () => {
    return <ListVisibleOutlined />
  }

  customShowHideDropdownButton = () => {
    return <Fragment>
      <ListVisibleOutlined className='mr-1'/>
      {this.formatMessage('showHideCols')}
    </Fragment>
  }

  render () {
    const {
      activeTabId,
      selectQueryFlag,
      tableShowColumns,
      mobileFlag,
      emptyTable,
      selectRecords,
      notReady,
      showLoading,
      interval,
      isShowSuggestion,
      searchSuggestion,
      notAllowDel,
      tableLoaded,
      tableTotal,
      tableSelected
    } = this.state
    let { dataSource } = this.state
    const { config, id, theme, enableDataAction, isHeightAuto, isWidthAuto } = this.props
    const { layersConfig, arrangeType } = config
    // data-action Table
    const daLayersConfig = this.getDataActionTable()
    const allLayersConfig = layersConfig.asMutable({ deep: true }).concat(daLayersConfig)
    let useDataSource
    const curLayer = allLayersConfig.find(item => item.id === activeTabId)
    if (curLayer?.dataActionDataSource) dataSource = curLayer.dataActionDataSource as QueriableDataSource
    if (allLayersConfig.length > 0) {
      useDataSource = curLayer
        ? curLayer.useDataSource
        : allLayersConfig[0].useDataSource
    }
    const classes = classNames(
      'jimu-widget',
      'widget-table',
      'table-widget-' + id
    )

    if (allLayersConfig.length === 0) {
      return (
        <WidgetPlaceholder
          widgetId={id}
          iconSize='large'
          style={{ position: 'absolute', left: 0, top: 0 }}
          icon={tablePlaceholderIcon}
          data-testid='tablePlaceholder'
        />
      )
    }

    const horizontalTag = arrangeType === TableArrangeType.Tabs
    const initSelectTableFields = this.getInitFields()
    const dataSourceLabel = dataSource?.getLabel()
    const outputDsWidgetId = appConfigUtils.getWidgetIdByOutputDataSource(useDataSource)
    const appConfig = getAppStore().getState()?.appConfig
    const widgetLabel = appConfig?.widgets?.[outputDsWidgetId]?.label
    const dataName = this.formatMessage('tableDataActionLabel', { layer: dataSourceLabel || '' })
    const hasSelected = tableSelected > 0
    const partProps = { id, enableDataAction, isHeightAuto, isWidthAuto, headerFontSetting: curLayer?.headerFontSetting }
    const searchOn = curLayer?.enableSearch && curLayer?.searchFields?.length !== 0
    const dataActionFields = tableShowColumns ? tableShowColumns.map(item => item.value as string) : curLayer?.tableFields.map(item => item.jimuName)
    const advancedTableField = curLayer.tableFields?.map(item => {
      return { value: item.name, label: item.alias }
    })

    return (
      <div className={classes} css={getStyle(theme, mobileFlag, partProps)} ref={el => (this.refs.currentEl = el)}>
        <div className='surface-1 border-0 h-100'>
          <div className='table-indent'>
            <div
              className={`d-flex ${
                horizontalTag ? 'horizontal-tag-list' : 'dropdown-tag-list'
              }`}
            >
              {/* someting wrong in lint check for Tabs */}
              {horizontalTag
                ? (
                  <Tabs type='underline' onChange={this.onTagClick} className='tab-flex' value={activeTabId} onClose={this.onCloseTab} scrollable>
                    {
                      allLayersConfig.map(item => {
                        const isDataAction = !!item.dataActionObject
                        return (
                          <Tab
                            key={item.id}
                            id={item.id}
                            title={item.name}
                            className='text-truncate tag-size'
                            closeable={isDataAction}
                          >
                            <div className='mt-2' />
                          </Tab>
                        )
                      }) as any
                    }
                  </Tabs>
                  )
                : (
                  <Select
                    size='sm'
                    value={activeTabId}
                    onChange={this.handleTagChange}
                    className='top-drop'
                  >
                    {allLayersConfig.map(item => {
                      return (
                        <option key={item.id} value={item.id} title={item.name}>
                          <div className='table-action-option'>
                            <div className='table-action-option-tab' title={item.name}>{item.name}</div>
                            {item.dataActionObject &&
                            <div className='table-action-option-close'>
                              <Button
                                size='sm'
                                icon
                                type='tertiary'
                                onClick={(evt) => { this.onCloseTab(item.id, evt) }}
                              >
                                <CloseOutlined size='s' />
                              </Button>
                            </div>
                            }
                          </div>
                        </option>
                      )
                    })}
                  </Select>
                  )}
            </div>
            <div
              className={`${
                arrangeType === TableArrangeType.Tabs
                  ? 'horizontal-render-con'
                  : 'dropdown-render-con'
              }`}
            >
              {searchOn && this.renderSearchTools(curLayer?.searchHint)}
              {searchOn &&
                <div ref='suggestPopup' style={{ position: 'relative', top: 25 }}>
                  <Popper
                    css={getSuggestionStyle()}
                    placement='bottom-start'
                    reference={this.refs.suggestPopup}
                    offset={[0, 8]}
                    open={isShowSuggestion}
                    trapFocus={false}
                    autoFocus={false}
                    toggle={e => {
                      this.setState({ isShowSuggestion: !isShowSuggestion })
                    }}
                  >
                    {searchSuggestion.map((suggestion, index) => {
                      const suggestionHtml = sanitizer.sanitize(
                        suggestion.suggestionHtml
                      )
                      return (
                        <Button
                          key={index}
                          type='secondary'
                          size='sm'
                          onClick={() => { this.onSuggestionConfirm(suggestion.suggestion) }}
                          dangerouslySetInnerHTML={{ __html: suggestionHtml }}
                        />
                      )
                    })}
                  </Popper>
                </div>
              }
              {/* Use Dropdown component instead of api */}
              {mobileFlag &&
                <Dropdown size='sm' className='d-inline-flex dropdown-list'>
                  <DropdownButton
                    arrow={false}
                    icon
                    size='sm'
                    title={this.formatMessage('options')}
                  >
                    <MoreHorizontalOutlined />
                  </DropdownButton>
                  <DropdownMenu>
                    {curLayer.enableSelect &&
                      <Fragment>
                        <DropdownItem key='showSelection' onClick={this.onShowSelection} disabled={!tableLoaded || emptyTable || !hasSelected}>
                          {selectQueryFlag ? <MenuOutlined className='mr-1'/> : <ShowSelectionOutlined className='mr-1' autoFlip/>}
                          {selectQueryFlag
                            ? this.formatMessage('showAll')
                            : this.formatMessage('showSelection')
                          }
                        </DropdownItem>
                        <DropdownItem key='clearSelection' onClick={this.onSelectionClear} disabled={!tableLoaded || emptyTable || !hasSelected}>
                          <TrashCheckOutlined className='mr-1'/>
                          {this.formatMessage('clearSelection')}
                        </DropdownItem>
                      </Fragment>
                    }
                    {curLayer.enableRefresh &&
                      <DropdownItem key='refresh' onClick={this.onTableRefresh} disabled={!tableLoaded || emptyTable}>
                        <RefreshOutlined className='mr-1'/>
                        {this.formatMessage('refresh')}
                      </DropdownItem>
                    }
                    {curLayer.enableEdit && !notAllowDel && false &&
                      <DropdownItem key='delete' onClick={this.onDeleteSelection} disabled={!tableLoaded || emptyTable || !hasSelected}>
                        <TrashOutlined className='mr-1'/>
                        {this.formatMessage('delete')}
                      </DropdownItem>
                    }
                    <DropdownItem key='showHideCols' tag='div' toggle={false} disabled={!tableLoaded || emptyTable}>
                      <AdvancedSelect
                        size='sm'
                        title={this.formatMessage('showHideCols')}
                        buttonProps={{ arrow: false, type: 'tertiary', className: 'p-0 table-hide-hover-color' }}
                        fluid
                        staticValues={advancedTableField}
                        sortValuesByLabel={false}
                        isMultiple
                        selectedValues={tableShowColumns || initSelectTableFields}
                        isEmptyOptionHidden={false}
                        onChange={this.onValueChangeFromRuntime}
                        customDropdownButtonContent={this.customShowHideDropdownButton}
                      />
                    </DropdownItem>
                  </DropdownMenu>
                </Dropdown>
              }
              {dataSource && mobileFlag && enableDataAction &&
                <Fragment>
                  {
                    allLayersConfig.map(item => {
                      const isCurrentDataSource = item.id === activeTabId
                      const dataActionDropdown = isCurrentDataSource
                        ? <div className='horizontal-action-dropdown' key={item.id}>
                          <DataActionList
                            widgetId={id}
                            listStyle={DataActionListStyle.Dropdown}
                            dataSets={[{ dataSource, type: 'selected', records: selectRecords, fields: dataActionFields, name: dataName }]}
                          />
                        </div>
                        : ''
                      return dataActionDropdown
                    })
                  }
                </Fragment>
              }
              <div className='top-button-list'>
                {curLayer.enableSelect && (
                  <div className='top-button ml-2'>
                    <Button
                      size='sm'
                      onClick={this.onShowSelection}
                      icon
                      title={
                        selectQueryFlag
                          ? this.formatMessage('showAll')
                          : this.formatMessage('showSelection')
                      }
                      disabled={!tableLoaded || emptyTable || !hasSelected}
                    >
                      {selectQueryFlag ? <MenuOutlined /> : <ShowSelectionOutlined autoFlip/>}
                    </Button>
                  </div>
                )}
                {curLayer.enableSelect &&
                  <div className='top-button ml-2'>
                    <Button
                      size='sm'
                      onClick={this.onSelectionClear}
                      icon
                      title={this.formatMessage('clearSelection')}
                      disabled={!tableLoaded || emptyTable || !hasSelected}
                    >
                      <TrashCheckOutlined />
                    </Button>
                  </div>
                }
                {curLayer.enableRefresh &&
                  <div className='top-button ml-2'>
                    <Button
                      size='sm'
                      onClick={this.onTableRefresh}
                      icon
                      title={this.formatMessage('refresh')}
                      disabled={!tableLoaded || emptyTable}
                    >
                      <RefreshOutlined />
                    </Button>
                  </div>
                }
                {curLayer.enableEdit && !notAllowDel && false &&
                  <div className='top-button ml-2'>
                    <Button
                      size='sm'
                      onClick={this.onDeleteSelection}
                      icon
                      title={this.formatMessage('delete')}
                      disabled={!tableLoaded || emptyTable || !hasSelected}
                    >
                      <TrashOutlined />
                    </Button>
                  </div>
                }
                <div className='top-button ml-2'>
                  <AdvancedSelect
                    size='sm'
                    title={this.formatMessage('showHideCols')}
                    buttonProps={{ icon: true, disabled: !tableLoaded || emptyTable, arrow: false }}
                    fluid
                    staticValues={advancedTableField}
                    sortValuesByLabel={false}
                    isMultiple
                    selectedValues={tableShowColumns || initSelectTableFields}
                    isEmptyOptionHidden={false}
                    onChange={this.onValueChangeFromRuntime}
                    customDropdownButtonContent={this.customShowHideButton}
                  />
                </div>
                {dataSource && !mobileFlag && enableDataAction &&
                  <Fragment>
                    <span className='tool-dividing-line'></span>
                    {
                      allLayersConfig.map(item => {
                        const isCurrentDataSource = item.id === activeTabId
                        const dataActionDropdown = isCurrentDataSource
                          ? <div className='top-button data-action-btn' key={item.id}>
                            <DataActionList
                              widgetId={id}
                              listStyle={DataActionListStyle.Dropdown}
                              dataSets={[{ dataSource, type: 'selected', records: selectRecords, fields: dataActionFields, name: dataName }]}
                            />
                          </div>
                          : ''
                        return dataActionDropdown
                      })
                    }
                  </Fragment>
                }
              </div>
              {emptyTable &&
                <div className='placeholder-table-con'>
                  <WidgetPlaceholder
                    icon={require('./assets/icon.svg')}
                    message={this.formatMessage('noData')}
                  />
                  {notReady &&
                    <div className='placeholder-alert-con'>
                      <Alert
                        form='tooltip'
                        size='small'
                        type='warning'
                        text={this.formatMessage('outputDataIsNotGenerated', { outputDsLabel: dataSourceLabel, sourceWidgetName: widgetLabel })}
                      />
                    </div>
                  }
                </div>
              }
              {/* Hide the Reset button temporarily */}
              {/* {emptyData &&
                <div className='placeholder-reset-con'>
                  <WidgetPlaceholder
                    icon={warningIcon}
                    message={this.formatMessage('noData')}
                  />
                  <Button
                    className="placeholder-reset-button"
                    size='sm'
                    title={this.formatMessage('reset')}
                    onClick={this.clearMessageAction}
                  >
                    {this.formatMessage('reset')}
                  </Button>
                </div>
              } */}
              <div ref='tableContainer' className='table-con' />
              {curLayer?.updateText && (showLoading || interval > 0) && this.renderLoading(showLoading, interval)}
              {curLayer?.showCount && this.renderTableCount(tableTotal, tableSelected)}
              <div className='ds-container'>
                <DataSourceComponent
                  widgetId={id}
                  useDataSource={Immutable(useDataSource)}
                  onDataSourceCreated={this.onDataSourceCreated}
                  onDataSourceInfoChange={this.onDataSourceInfoChange}
                  onQueryRequired={this.onQueryRequired}
                />
              </div>
              <Global styles={getGlobalTableTools(theme)} />
            </div>
          </div>
        </div>
        <ReactResizeDetector
          handleWidth
          handleHeight
          onResize={this.debounceOnResize}
        />
      </div>
    )
  }
}
