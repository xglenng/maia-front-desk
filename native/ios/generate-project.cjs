// Dependency-free deterministic Xcode project generation. No downloads/signing.
const fs=require('node:fs'),path=require('node:path');
const root=__dirname,objects={};let seq=1;
function add(object){const id=(seq++).toString(16).toUpperCase().padStart(24,'0');objects[id]=object;return id;}
const swift=['MaiaApp.swift','APIClient.swift','MaiaWebView.swift','NativePayments.swift'];
const sources=swift.map(name=>add({isa:'PBXFileReference',lastKnownFileType:'sourcecode.swift',path:name,sourceTree:'<group>'}));
const plist=add({isa:'PBXFileReference',lastKnownFileType:'text.plist.xml',path:'Info.plist',sourceTree:'<group>'});
const app=add({isa:'PBXFileReference',explicitFileType:'wrapper.application',path:'Maia.app',sourceTree:'BUILT_PRODUCTS_DIR'});
const appGroup=add({isa:'PBXGroup',children:[...sources,plist],path:'Maia',sourceTree:'<group>'});
const products=add({isa:'PBXGroup',children:[app],name:'Products',sourceTree:'<group>'});
const main=add({isa:'PBXGroup',children:[appGroup,products],sourceTree:'<group>'});
const pkg=add({isa:'XCRemoteSwiftPackageReference',repositoryURL:'https://github.com/stripe/stripe-terminal-ios-spm.git',requirement:{kind:'exactVersion',version:'6.0.0'}});
const dependency=add({isa:'XCSwiftPackageProductDependency',package:pkg,productName:'StripeTerminal'});
const framework=add({isa:'PBXBuildFile',productRef:dependency});
const sourceFiles=sources.map(fileRef=>add({isa:'PBXBuildFile',fileRef}));
const sourcePhase=add({isa:'PBXSourcesBuildPhase',buildActionMask:'2147483647',files:sourceFiles,runOnlyForDeploymentPostprocessing:'0'});
const frameworkPhase=add({isa:'PBXFrameworksBuildPhase',buildActionMask:'2147483647',files:[framework],runOnlyForDeploymentPostprocessing:'0'});
const resources=add({isa:'PBXResourcesBuildPhase',buildActionMask:'2147483647',files:[],runOnlyForDeploymentPostprocessing:'0'});
function configs(settings){const items=['Debug','Release'].map(name=>add({isa:'XCBuildConfiguration',name,buildSettings:{...settings,SWIFT_ACTIVE_COMPILATION_CONDITIONS:name==='Debug'?'DEBUG':'',...(settings.MAIA_BASE_URL&&name==='Debug'?{MAIA_BASE_URL:'http://127.0.0.1:3100'}:{}),SWIFT_OPTIMIZATION_LEVEL:name==='Debug'?'-Onone':'-O'}}));return add({isa:'XCConfigurationList',buildConfigurations:items,defaultConfigurationIsVisible:'0',defaultConfigurationName:'Release'});}
const targetConfig=configs({PRODUCT_BUNDLE_IDENTIFIER:'com.gavakatasoftware.maia',PRODUCT_NAME:'$(TARGET_NAME)',INFOPLIST_FILE:'Maia/Info.plist',SWIFT_VERSION:'5.0',IPHONEOS_DEPLOYMENT_TARGET:'16.0',TARGETED_DEVICE_FAMILY:'1',CODE_SIGN_STYLE:'Automatic',MAIA_BASE_URL:'https://maia-front-desk-production.up.railway.app',GENERATE_INFOPLIST_FILE:'NO',LD_RUNPATH_SEARCH_PATHS:'$(inherited) @executable_path/Frameworks'});
const target=add({isa:'PBXNativeTarget',buildConfigurationList:targetConfig,buildPhases:[sourcePhase,frameworkPhase,resources],buildRules:[],dependencies:[],name:'Maia',packageProductDependencies:[dependency],productName:'Maia',productReference:app,productType:'com.apple.product-type.application'});
const project=add({isa:'PBXProject',attributes:{LastUpgradeCheck:'1600'},buildConfigurationList:configs({SDKROOT:'iphoneos',CLANG_ENABLE_MODULES:'YES',SWIFT_VERSION:'5.0'}),compatibilityVersion:'Xcode 14.0',developmentRegion:'en',knownRegions:['en','Base'],mainGroup:main,packageReferences:[pkg],productRefGroup:products,projectDirPath:'',projectRoot:'',targets:[target]});
function encode(value){if(Array.isArray(value))return '(\n'+value.map(v=>encode(v)+',').join('\n')+'\n)';if(value&&typeof value==='object')return '{\n'+Object.entries(value).map(([k,v])=>JSON.stringify(k)+' = '+encode(v)+';').join('\n')+'\n}';return JSON.stringify(String(value));}
fs.mkdirSync(path.join(root,'Maia.xcodeproj'),{recursive:true});
fs.writeFileSync(path.join(root,'Maia.xcodeproj/project.pbxproj'),'// !$*UTF8*$!\n'+encode({archiveVersion:1,classes:{},objectVersion:56,objects,rootObject:project})+'\n');
const scheme=`<?xml version="1.0" encoding="UTF-8"?><Scheme LastUpgradeVersion="1600" version="1.3"><BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${target}" BuildableName="Maia.app" BlueprintName="Maia" ReferencedContainer="container:Maia.xcodeproj"/></BuildActionEntry></BuildActionEntries></BuildAction><LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${target}" BuildableName="Maia.app" BlueprintName="Maia" ReferencedContainer="container:Maia.xcodeproj"/></BuildableProductRunnable></LaunchAction><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/></Scheme>`;
const schemeDir=path.join(root,'Maia.xcodeproj/xcshareddata/xcschemes');fs.mkdirSync(schemeDir,{recursive:true});fs.writeFileSync(path.join(schemeDir,'Maia.xcscheme'),scheme+'\n');
console.log('Generated Maia Xcode project with Stripe Terminal 6.0.0. No build or signing performed.');
