export type Entreprise={id?:string;user_id:string;nom:string;adresse:string;telephone:string;email:string;siret:string;signature_data_url?:string|null}
export type Prestation={id?:string;user_id:string;nom:string;prix:number}
export type Ligne={id:string;nom:string;qte:number;pu:number}
export type Dossier={id?:string;user_id:string;reference:string;defunt_nom:string;defunt_prenom:string;famille_contact:string;ceremonie_date?:string|null;ceremonie_lieu?:string|null;prestations:string[];marbrerie:Ligne[];autres:Ligne[];cree_le:string;modifie_le:string;archive?:boolean}