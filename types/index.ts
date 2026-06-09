export type DesignType = 'cheek' | 'eye' | 'full'

export interface Design {
  id: string
  name: string
  type: DesignType
  image_url: string
  created_at: string
}
