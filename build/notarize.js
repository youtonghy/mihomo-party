const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function(context) {
  const { electronPlatformName, appOutDir } = context;
  
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  
  console.log('开始重新签名 Electron 辅助进程...');
  
  // 签名配置
  const identity = process.env.CSC_NAME || 'Developer ID Application';
  const entitlementsPath = path.join(__dirname, 'entitlements.mac.plist');
  const childEntitlementsPath = path.join(__dirname, 'entitlements.mac.child.plist');
  
  // 构造完整的证书名称
  const fullIdentity = identity.includes('Developer ID Application') 
    ? identity 
    : `Developer ID Application: ${identity}`;
  
  console.log(`使用签名身份: ${fullIdentity}`);
  
  // 需要重新签名的框架和二进制文件（使用child entitlements）
  const frameworksToSign = [
    'Contents/Frameworks/Electron Framework.framework/Versions/A/Helpers/chrome_crashpad_handler',
    'Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework',
    'Contents/Frameworks/Electron Framework.framework'
  ];
  
  // Helper应用（使用child entitlements）
  const helpersToSign = [
    `Contents/Frameworks/${appName} Helper.app`,
    `Contents/Frameworks/${appName} Helper (GPU).app`,
    `Contents/Frameworks/${appName} Helper (Plugin).app`,
    `Contents/Frameworks/${appName} Helper (Renderer).app`
  ];
  
  // 首先签名框架
  for (const frameworkPath of frameworksToSign) {
    const fullPath = path.join(appPath, frameworkPath);
    
    if (fs.existsSync(fullPath)) {
      console.log(`签名框架: ${frameworkPath}`);
      
      try {
        const signCommand = [
          'codesign',
          '--sign', `"${fullIdentity}"`,
          '--force',
          '--verbose',
          '--options', 'runtime',
          '--timestamp',
          '--entitlements', `"${childEntitlementsPath}"`,
          `"${fullPath}"`
        ].join(' ');
        
        execSync(signCommand, { stdio: 'inherit' });
        console.log(`✓ 成功签名: ${frameworkPath}`);
        
      } catch (error) {
        console.error(`✗ 签名失败: ${frameworkPath}`, error.message);
        throw error;
      }
    }
  }
  
  // 然后签名Helper应用
  for (const helperPath of helpersToSign) {
    const fullPath = path.join(appPath, helperPath);
    
    if (fs.existsSync(fullPath)) {
      console.log(`签名Helper: ${helperPath}`);
      
      try {
        const signCommand = [
          'codesign',
          '--sign', `"${fullIdentity}"`,
          '--force',
          '--verbose',
          '--options', 'runtime',
          '--timestamp',
          '--entitlements', `"${childEntitlementsPath}"`,
          `"${fullPath}"`
        ].join(' ');
        
        execSync(signCommand, { stdio: 'inherit' });
        console.log(`✓ 成功签名: ${helperPath}`);
        
        // 验证签名
        execSync(`codesign --verify --verbose=2 "${fullPath}"`, { stdio: 'inherit' });
        
      } catch (error) {
        console.error(`✗ 签名失败: ${helperPath}`, error.message);
        throw error;
      }
    } else {
      console.log(`跳过不存在的Helper: ${helperPath}`);
    }
  }
  
  // 最后重新签名主应用
  console.log('重新签名主应用...');
  try {
    const mainSignCommand = [
      'codesign',
      '--sign', `"${fullIdentity}"`,
      '--force',
      '--verbose',
      '--options', 'runtime',
      '--timestamp',
      '--entitlements', `"${entitlementsPath}"`,
      `"${appPath}"`
    ].join(' ');
    
    execSync(mainSignCommand, { stdio: 'inherit' });
    console.log('✓ 主应用签名成功');
    
    // 验证主应用签名
    execSync(`codesign --verify --verbose=2 "${appPath}"`, { stdio: 'inherit' });
    execSync(`spctl --assess --verbose --type execute "${appPath}"`, { stdio: 'inherit' });
    
  } catch (error) {
    console.error('✗ 主应用签名失败', error.message);
    throw error;
  }
  
  console.log('所有组件签名完成!');
}; 