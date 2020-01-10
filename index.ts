export interface Next<A, R> {
  next : (result : A) => R
}
export interface IGetById<Id, Doc, R> extends Next<Doc, R>{
  readonly _tag : "IGetById"
  id : Id 
}

export interface IGetAll<Id, Doc, R> extends Next<Doc[], R> { 
  readonly _tag : "IGetAll"
}

export interface IUpdate<Id, Doc, R> extends Next<void, R>{
  readonly _tag : "IUpdate"
  id : Id
  doc : Doc
}

export interface ICreate<Id, Doc, R> extends Next<Id, R> {
  readonly _tag : "ICreate"
  doc : Doc
}

export type ICRUD_<Id, Doc, R> = 
    IGetById<Id, Doc, R>
  | IGetAll<Id, Doc, R>
  | IUpdate<Id, Doc, R>
  | ICreate<Id, Doc, R>

export const igetById = <Id, Doc, R>(id : Id, next : (doc : Doc) => R) : ICRUD_<Id, Doc, R> => (
  { _tag : "IGetById"
  , next
  , id
  }
)

export const igetAll = <Id, Doc, R>(next : (docs: Doc[]) => R) : ICRUD_<Id, Doc, R> => (
  { _tag : "IGetAll"
  , next
  }
)

export const iupdate = <Id, Doc, R>(id : Id, doc : Doc, next : () => R) : ICRUD_<Id, Doc, R> => (
  { _tag : "IUpdate"
  , next
  , id
  , doc
  }
)

export const icreate = <Id, Doc, R>(doc : Doc, next : (newId : Id) => R) : ICRUD_<Id, Doc, R> => (
  { _tag : "ICreate"
  , next
  , doc
  }
)

export const mapICRUD_ = <Id, Doc, A, B>(f : (a : A) => B, icrud : ICRUD_<Id, Doc, A>) : ICRUD_<Id, Doc, B> => {
  switch(icrud._tag) {
    case "IGetById" : return igetById(icrud.id, doc => f(icrud.next(doc)))
    case "IGetAll"  : return igetAll(docs => f(icrud.next(docs)))
    case "IUpdate"  : return iupdate(icrud.id, icrud.doc, () => f(icrud.next()))
    case "ICreate"  : return icreate(icrud.doc, (newId) => f(icrud.next(newId)))
  }
}

export interface Result<A> {
  readonly _tag   : "Result"
  readonly result : A
}

type CRUD<Id, Doc, A> = Result<A> | ICRUD_<Id, Doc, ICRUD<Id, Doc, A>>

export interface ICRUD<Id, Doc, A> {
  _crud : CRUD<Id, Doc, A>
}

const crud = <Id, Doc, A>(_crud : CRUD<Id, Doc, A>) : ICRUD<Id, Doc, A> => (
  { _crud
  }
)

export const unCRUD = <Id, Doc, A>({_crud} : ICRUD<Id, Doc, A>) : CRUD<Id, Doc, A> =>
  _crud

const result = <Id, Doc, A>(result : A) : Result<A> => (
  { _tag : "Result"
  , result
  }
)

export const finished = <Id, Doc, A>(x : A) : ICRUD<Id, Doc, A> => 
  crud(result(x))

export const getById_ = <Id, Doc, A>(id : Id, next : (doc : Doc) => ICRUD<Id, Doc, A>) : ICRUD<Id, Doc, A> => 
  crud (igetById(id, next))

export const getById = <Id, Doc>(id : Id) : ICRUD<Id, Doc, Doc> => 
  getById_ (id, doc => finished(doc))

export const getAll_ = <Id, Doc, A>(next : (docs: Doc[]) => ICRUD<Id, Doc, A>) : ICRUD<Id, Doc, A> => 
  crud (igetAll(next))
 
export const getAll = <Id, Doc>() : ICRUD<Id, Doc, Doc[]> =>
  getAll_(docs => finished(docs))

export const update_ = <Id, Doc, A>(id : Id, doc : Doc, next : () => ICRUD<Id, Doc, A>) : ICRUD<Id, Doc, A> => 
  crud (iupdate(id, doc, next))

export const update = <Id, Doc>(id : Id, doc : Doc) : ICRUD<Id, Doc, null> =>
  update_(id, doc, () => finished(null))

export const create_ = <Id, Doc, A>(doc : Doc, next : (newId : Id) => ICRUD<Id, Doc, A>) : ICRUD<Id, Doc, A> =>
  crud(icreate(doc, next))

export const create = <Id, Doc>(doc : Doc) : ICRUD<Id, Doc, Id> =>
  create_(doc, (newId) => finished(newId))

//I need a way to allow the user to pass custom implementations of a monad to use with the evaluation
//I need a 

export const evalICRUD = <Id, Doc, A>(evaluator : (crud : ICRUD_<Id, Doc, A>) => A, crud : ICRUD<Id, Doc, A>) : A => {
  const query = unCRUD(crud)

  switch(query._tag) {
    case "Result" : return query.result
    default       : return evaluator(mapICRUD_(nextQuery => evalICRUD(evaluator, nextQuery), query))
  }
}

export const runICRUD = <Id, Doc, A>(evaluator : <X>(crud : ICRUD_<Id, Doc, X>) => X, crud : ICRUD<Id, Doc, A>) : A => {
  const query = unCRUD(crud)

  switch(query._tag) {
    case "Result" : return query.result
    default       : return runICRUD(evaluator, evaluator(query))
  }
}

export const runICRUDPromise = <Id, Doc, A>(evaluator : <X>(crud : ICRUD_<Id, Doc, X>) => Promise<X>, crud : ICRUD<Id, Doc, A>) : Promise<A> => {
  const query = unCRUD(crud)

  switch(query._tag) {
    case "Result" : return Promise.resolve(query.result)
    default       : return evaluator(query).then(nextQuery => runICRUDPromise(evaluator, nextQuery))
  }
}

export const mapCRUD = <Id, Doc, A, B>(f : (a : A) => B, query : ICRUD<Id, Doc, A>) : ICRUD<Id, Doc, B> => {
  const _query = unCRUD(query);

  switch(_query._tag) {
    case "Result"   : return finished(f(_query.result))
    default         : return crud(mapICRUD_(nextQuery => mapCRUD(f, nextQuery), _query))
  }
}
  
export const andThen = <Id, Doc, A, B>(query : ICRUD<Id, Doc, A>, f : (x : A) => ICRUD<Id, Doc, B>) : ICRUD<Id, Doc, B> => {
  const _query = unCRUD(query);

  switch(_query._tag) {
    case "Result"   : return f(_query.result)
    default         : return crud(mapICRUD_(nextQuery => andThen(nextQuery, f), _query))
  }
}

export const pair = <Id, Doc, A, B>(crud1 : ICRUD<Id, Doc, A>, crud2 : ICRUD<Id, Doc, B>) : ICRUD<Id, Doc, [A, B]> =>
  andThen(crud1, r1 => mapCRUD(r2 => [r1, r2], crud2))

const flattenPair = <A>([x, xs] : [A, A[]]) : A[] =>
  (xs.push(x), xs)

export const sequence = <Id, Doc, A>(cruds : ICRUD<Id, Doc, A>[]) : ICRUD<Id, Doc, A[]> =>
  cruds.reduce
    ( (results, crud) => mapCRUD (xs => flattenPair(xs) , pair(crud, results))
    , finished<Id, Doc, A[]>([])
    )

export type IQuery<Id, Doc, Result> = ICRUD_<Id, Doc, Result>

export class Query<Id, Doc, A> {
  private _query : ICRUD<Id, Doc, A>;

  private constructor(_query : ICRUD<Id, Doc, A>) {
    this._query = _query;
  }

  public runEval(evaluator : (query : ICRUD_<Id, Doc, A>) => A) : A {
    return evalICRUD(evaluator, this._query)
  }

  public run(evaluator : <X>(query : ICRUD_<Id, Doc, X>) => X) : A {
    return runICRUD(evaluator, this._query);
  }

  public runPromise(evaluator : <X>(query : ICRUD_<Id, Doc, X>) => Promise<X>) : Promise<A> {
    return runICRUDPromise(evaluator, this._query)
  }

  public map<B>(f : (a : A) => B) : Query<Id, Doc, B> {
    return new Query(mapCRUD(f, this._query))
  }

  public zip_<B>(crud : ICRUD<Id, Doc, B>) : Query<Id, Doc, [A, B]> {
    return new Query(pair(this._query, crud))
  }

  public zip<B>(query : Query<Id, Doc, B>) : Query<Id, Doc, [A, B]> {
    return this.zip_(query._query);
  }

  public andThen_<B>(f : (a : A) => ICRUD<Id, Doc, B>) : Query<Id, Doc, B> {
    return new Query(andThen(this._query, f))
  }

  public andThen<B>(f : (a : A) => Query<Id, Doc, B>) : Query<Id, Doc, B> {
    return this.andThen_(a => f(a)._query)
  }

  public static getById<I, D>(id : I) : Query<I, D, D> {
    return new Query(getById(id))
  }

  public getById(id : Id) : Query<Id, Doc, Doc> {
    return this.andThen_(_ => getById(id))
  }

  public static getAll<I, D>() : Query<I, D, D[]> {
    return new Query(getAll())
  }

  public getAll() : Query<Id, Doc, Doc[]> {
    return this.andThen_(_ => getAll())
  }

  public static update<I, D>(id : I, doc : D) : Query<I, D, null> {
    return new Query(update(id, doc))
  }

  public update(id : Id, doc : Doc) : Query<Id, Doc, null> {
    return this.andThen_(_ => update(id, doc))
  }

  public static create<I, D>(doc : D) : Query<I, D, I> {
    return new Query(create(doc))
  }

  public create(doc : Doc) : Query<Id, Doc, Id> {
    return this.andThen_(_ => create(doc))
  }

  public static finished<I, D, A>(a : A) : Query<I, D, A> {
    return new Query(finished(a))
  }

  public finished<A>(a : A) : Query<Id, Doc, A> {
    return this.andThen_(_ => finished(a))
  }
}
