import { NativeModule, requireOptionalNativeModule } from 'expo'

// Android-only (see android/…/DeltaUpdaterModule.kt); null on iPhone, which can't install apps itself.
declare class DeltaUpdaterModule extends NativeModule {
  canInstall(): boolean
  openInstallSettings(): boolean
  install(path: string): boolean
}

export default requireOptionalNativeModule<DeltaUpdaterModule>('DeltaUpdater')
