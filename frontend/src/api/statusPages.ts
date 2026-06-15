export interface StatusPageOut {
  id: number
  user_id: number
  slug: string
  company_name: string
  logo_url: string
  description: string
  is_public: boolean
}

export interface StatusPageCreate {
  slug: string
  company_name: string
  logo_url: string
  description: string
}
