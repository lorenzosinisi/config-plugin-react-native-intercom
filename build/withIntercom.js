"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.withIntercomInfoPlist = exports.withIntercomAppDelegate = exports.modifyObjcAppDelegate = void 0;
const config_plugins_1 = require("@expo/config-plugins");
const promises_1 = __importDefault(require("fs/promises"));
const checkProjectBuildGradle = ({ contents }) => {
    var _a, _b, _c, _d;
    const minSdkVersion = parseInt((_b = (_a = contents.match(/minSdkVersion\s*=\s*(.*)/)) === null || _a === void 0 ? void 0 : _a[1]) !== null && _b !== void 0 ? _b : "-1", 10);
    // Check for the min sdk version
    if (minSdkVersion < 21) {
        throw new Error(`minSdkVersion needs to be at least 21, current version: ${minSdkVersion}`);
    }
    // Extract the version code and convert it to a number from classpath("com.android.tools.build:gradle:4.0.1")
    const gradleToolVersionCode = parseFloat((_d = (_c = contents.match(/classpath\("com\.android\.tools\.build:gradle:(.*)"\)/)) === null || _c === void 0 ? void 0 : _c[1]) !== null && _d !== void 0 ? _d : "-1");
    if (gradleToolVersionCode < 4) {
        throw new Error(`com.android.tools.build:gradle  version needs to be at least 4.0, current version: ${gradleToolVersionCode}`);
    }
};
const withIntercomProjectBuildGradle = (config) => {
    return config_plugins_1.withProjectBuildGradle(config, async (config) => {
        // config = { modResults, modRequest, ...expoConfig }
        // Modify the project build.gradle
        checkProjectBuildGradle({
            contents: config.modResults.contents,
        });
        return config;
    });
};
const modifyMainApplication = ({ contents, apiKey, appId, packageName, }) => {
    if (!packageName) {
        throw new Error("Android package not found");
    }
    const importLine = `import com.intercom.reactnative.IntercomModule;`;
    if (!contents.includes(importLine)) {
        const packageImport = `package ${packageName};`;
        // Add the import line to the top of the file
        // Replace the first line with the intercom import
        contents = contents.replace(`${packageImport}`, `${packageImport}\n${importLine}`);
    }
    const initLine = `IntercomModule.initialize(this, "${apiKey}", "${appId}");`;
    if (!contents.includes(initLine)) {
        // TODO: Replace this with safer regex
        const soLoaderLine = `SoLoader.init(this, /* native exopackage */ false);`;
        // Replace the line SoLoader.init(this, /* native exopackage */ false); with regex
        contents = contents.replace(`${soLoaderLine}`, `${soLoaderLine}\n\t\t${initLine}\n`);
    }
    return contents;
};
const withIntercomMainApplication = (config, { apiKey, appId }) => {
    return config_plugins_1.withMainApplication(config, async (config) => {
        // Modify the project build.gradle
        config.modResults.contents = modifyMainApplication({
            contents: config.modResults.contents,
            apiKey,
            appId,
            packageName: config_plugins_1.AndroidConfig.Package.getPackage(config),
        });
        return config;
    });
};
const withIntercomAndroidManifest = (config) => {
    return config_plugins_1.withAndroidManifest(config, async (config) => {
        // Check to see if android already contains the read external storage permissions
        const readExternalStoragePermission = "android.permission.READ_EXTERNAL_STORAGE";
        if (!config_plugins_1.AndroidConfig.Permissions.getPermissions(config.modResults).includes(readExternalStoragePermission)) {
            config_plugins_1.AndroidConfig.Permissions.addPermission(config.modResults, readExternalStoragePermission);
        }
        return config;
    });
};
const initMethodInvocationBlock = `[IntercomModule initialize:`;
function modifyObjcAppDelegate({ contents, apiKey, appId, }) {
    // Add import
    if (!contents.includes("#import <IntercomModule.h>")) {
        // Replace the first line with the intercom import
        contents = contents.replace(/#import "AppDelegate.h"/g, `#import "AppDelegate.h"\n#import <IntercomModule.h>`);
    }
    // Add invocation
    if (!contents.includes(initMethodInvocationBlock)) {
        // TODO: Determine if this is safe
        contents = contents.replace(/return YES;/g, `${initMethodInvocationBlock}@"${apiKey}" withAppId:@"${appId}"];\n\n\treturn YES;`);
    }
    return contents;
}
exports.modifyObjcAppDelegate = modifyObjcAppDelegate;
const withIntercomAppDelegate = (config, { apiKey, appId }) => {
    return config_plugins_1.withDangerousMod(config, [
        "ios",
        async (config) => {
            const fileInfo = config_plugins_1.IOSConfig.Paths.getAppDelegate(config.modRequest.projectRoot);
            let contents = await promises_1.default.readFile(fileInfo.path, "utf-8");
            if (fileInfo.language === "objc") {
                contents = modifyObjcAppDelegate({ contents, apiKey, appId });
            }
            else {
                throw new Error(`Cannot add Intercom code to AppDelegate of language "${fileInfo.language}"`);
            }
            await promises_1.default.writeFile(fileInfo.path, contents);
            return config;
        },
    ]);
};
exports.withIntercomAppDelegate = withIntercomAppDelegate;
const withIntercomInfoPlist = (config, { iosPhotoUsageDescription }) => {
    return config_plugins_1.withInfoPlist(config, async (config) => {
        // Add on the right permissions for expo to use the photo library, this might change if we add more permissions
        // @ts-ignore
        if (!config.modResults.NSPhotoLibraryUsageDescription) {
            // @ts-ignore
            config.modResults.NSPhotoLibraryUsageDescription =
                iosPhotoUsageDescription !== null && iosPhotoUsageDescription !== void 0 ? iosPhotoUsageDescription : "Upload images to support center";
        }
        return config;
    });
};
exports.withIntercomInfoPlist = withIntercomInfoPlist;
/**
 * A config plugin for configuring `react-native-firebase`
 */
const withIntercom = (config, { appId, iosApiKey, androidApiKey, iosPhotoUsageDescription }) => {
    let localConfig = config;
    // Add ios specific plugins
    if (iosApiKey) {
        localConfig = config_plugins_1.withPlugins(localConfig, [
            [exports.withIntercomAppDelegate, { apiKey: iosApiKey, appId }],
            [exports.withIntercomInfoPlist, { iosPhotoUsageDescription }],
        ]);
    }
    // add android specific plugins
    if (androidApiKey) {
        localConfig = config_plugins_1.withPlugins(localConfig, [
            [withIntercomAndroidManifest, {}],
            [withIntercomMainApplication, { apiKey: androidApiKey, appId }],
            [withIntercomProjectBuildGradle, {}],
        ]);
    }
    return localConfig;
};
exports.default = withIntercom;
