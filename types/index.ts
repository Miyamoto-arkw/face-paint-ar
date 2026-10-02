/** 配置プリセット。DB値は互換のため 'eye' のまま（意味は「目尻〜こめかみ」） */
export type DesignType = 'cheek' | 'eye' | 'full'

export const DESIGN_TYPE_LABEL: Record<DesignType, string> = {
  cheek: '頬',
  eye: '目尻〜こめかみ',
  full: '全顔',
}

export interface Design {
  id: string
  name: string
  type: DesignType
  image_url: string
  created_at: string
}
