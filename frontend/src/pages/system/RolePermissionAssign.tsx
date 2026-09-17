/**
 * MES 系统 - 权限分配组件
 * 功能：展示权限树（带复选框）→ 勾选权限 → 保存到角色
 * 作为弹窗被 RoleManagement 调用
 */

import { useState, useEffect, type Key } from 'react';
import { Modal, Tree, Spin, App } from 'antd';
import type { TreeDataNode } from 'antd';
import { getAllPermissions, getRolePermissions, assignPermissions } from '@/api/role.api';
import type { Permission } from '@/types';

interface RolePermissionAssignProps {
  /** 角色 ID */
  roleId: number;
  /** 角色名称 */
  roleName: string;
  /** 弹窗是否可见 */
  visible: boolean;
  /** 关闭弹窗回调 */
  onClose: () => void;
  /** 保存成功后的回调 */
  onSuccess?: () => void;
}

/** 权限树节点 key 的类型 */
type CheckedKeys = {
  checked: number[];
  halfChecked: number[];
};

/**
 * 将权限树数据转换为 Ant Design Tree 的 treeData 格式
 */
function convertToTreeData(permissions: Permission[]): TreeDataNode[] {
  return permissions.map((perm) => ({
    key: perm.id,
    title: `${perm.name}（${perm.code}）`,
    children: perm.children ? convertToTreeData(perm.children) : undefined,
  }));
}

/**
 * 收集树中所有节点的 key（用于展开全部）
 */
function collectAllKeys(permissions: Permission[]): number[] {
  const keys: number[] = [];
  for (const perm of permissions) {
    keys.push(perm.id);
    if (perm.children && perm.children.length > 0) {
      keys.push(...collectAllKeys(perm.children));
    }
  }
  return keys;
}

/** 权限分配弹窗组件 */
function RolePermissionAssign({
  roleId,
  roleName,
  visible,
  onClose,
  onSuccess,
}: RolePermissionAssignProps) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [treeData, setTreeData] = useState<TreeDataNode[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<number[]>([]);
  const [checkedKeys, setCheckedKeys] = useState<CheckedKeys>({
    checked: [],
    halfChecked: [],
  });

  /** 加载权限树和角色已有权限 */
  const loadData = async () => {
    setLoading(true);
    try {
      const [permissions, rolePerms] = await Promise.all([
        getAllPermissions(),
        getRolePermissions(roleId),
      ]);

      setTreeData(convertToTreeData(permissions));
      setExpandedKeys(collectAllKeys(permissions));
      setCheckedKeys({
        checked: rolePerms.permissionIds,
        halfChecked: [],
      });
    } catch {
      // 错误已由 Axios 拦截器处理
    } finally {
      setLoading(false);
    }
  };

  // 弹窗打开时加载数据
  useEffect(() => {
    if (visible && roleId) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, roleId]);

  /** 处理复选框勾选 */
  const handleCheck = (
    checked: Key[] | { checked: Key[]; halfChecked: Key[] },
    info: { halfCheckedKeys?: Key[] },
  ) => {
    if (Array.isArray(checked)) {
      setCheckedKeys({
        checked: checked as number[],
        halfChecked: (info.halfCheckedKeys || []) as number[],
      });
    } else {
      setCheckedKeys({
        checked: checked.checked as number[],
        halfChecked: checked.halfChecked as number[],
      });
    }
  };

  /** 保存权限分配 */
  const handleSave = async () => {
    setSaving(true);
    try {
      // 合并 checked 和 halfChecked（部分选中的父节点也需要保存）
      const allPermissionIds = [
        ...checkedKeys.checked,
        ...checkedKeys.halfChecked,
      ];

      // 去重
      const uniqueIds = Array.from(new Set(allPermissionIds));

      await assignPermissions(roleId, uniqueIds);
      message.success('权限分配成功');
      onSuccess?.();
      onClose();
    } catch {
      // 错误已由 Axios 拦截器处理
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`分配权限 - ${roleName}`}
      open={visible}
      onOk={handleSave}
      onCancel={onClose}
      confirmLoading={saving}
      okText="保存"
      cancelText="取消"
      width={600}
      destroyOnClose
    >
      <Spin spinning={loading}>
        <Tree
          treeData={treeData}
          checkable
          checkStrictly={false}
          checkedKeys={checkedKeys.checked}
          expandedKeys={expandedKeys}
          onExpand={(keys) => setExpandedKeys(keys as number[])}
          onCheck={handleCheck}
          defaultExpandAll
          selectable={false}
          showLine
        />
      </Spin>
    </Modal>
  );
}

export default RolePermissionAssign;
