/* eslint-disable max-lines */
import { AutoBind } from 'common/utils/oop';
import * as immutableTree from 'common/data/immutableTree';
import {
    ITree,
    findNode,
    filterNodes,
    flattenNodes,
    flattenSubTree,
    iterateDescendants
} from 'common/data/immutableTree';
import { bindInstruction, seq, parallel, extCall } from '../..';
import IRepository, {
    IEventType,
    IInsertNodesParams,
    INonStandardParams,
    IParams,
    IStandardParams,
    IPlace,
    IRepositoryData,
    IModificationOptions,
    ILoadParams,
    IRootNodeId,
    IRootNode,
    IMoveParams,
    IGetRepository as IBaseGetRepository,
    ILoadNodesComplexResponse,
    ILoadNodesChildrenParams,
    ILoadNodesResponse,
    totalIsKnown
} from '../IRepository';
import { IError, generateClientId } from 'sv.common/request/request';
import { queue, debounce, transaction, exitBy } from 'common/redux-components/plugins';
import {
    IInsertPlace,
    RootNodeId,
    RootNode,
    IInsertNodesBunchParams
} from 'common/redux-components/data/IRepository';
import {
    convertLoadNodeChildrenToLoadNodesChildren,
    insertLoadedChildrenToTree,
    INormalizedLoadedResult
} from './_utils';
import AppError from 'common/utils/AppError';
import { ensureNotRootId } from 'common/redux-components/data/IRepository';
import { emptyTree } from 'common/data/immutableTree';

export type ISetData<
    TNode,
    TId extends HashKey,
    TInstruction extends reduxCmp.IAnyInstruction,
    TStoredData extends IRepositoryData<TNode, TId> = IRepositoryData<TNode, TId>
> = (data: TStoredData) => TInstruction;

export type IGetRepository<
    TNode,
    TId extends HashKey,
    TInstruction extends reduxCmp.IAnyInstruction,
    TStoredData extends IRepositoryData<TNode, TId> = IRepositoryData<TNode, TId>,
    TUpdateError = IError,
    TRemoveError = IError,
    TRemoveOptions = {}
> = IBaseGetRepository<
    TNode,
    TId,
    TInstruction,
    TStoredData,
    TUpdateError,
    TRemoveError,
    TRemoveOptions,
    Repository<TNode, TId, TInstruction, TStoredData, TUpdateError, TRemoveError, TRemoveOptions>
>;

/* istanbul ignore next */
export const createData = R.memGeneric(
    <TNode>(
        tree: ITree<TNode> = immutableTree.emptyTree,
        total?: number
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): IRepositoryData<any, any> => ({
        tree,
        loaded: !immutableTree.isEmptyTree(tree),
        loadedNodes: R.emptyObject,
        loadingNodes: R.emptyObject,
        newNodes: R.emptyArray,
        cache: R.emptyObject,
        justRemoved: R.emptyArray,
        justInserted: R.emptyArray,
        justUpdated: R.emptyArray,
        justMoved: R.emptyArray,
        justChildrenLoaded: R.emptyArray,
        justSetData: 0,
        total: total === undefined ? immutableTree.getChildren(tree, undefined).length : total,
        loadingEnabled: true
    })
);

export class RepositoryError extends AppError {}

// todo @noname [no-priority] continue on launching instructions even if component is destroyed
// todo @noname [no-priority] refactor
export class Repository<
    TNode,
    TId extends HashKey,
    TInstruction extends reduxCmp.IAnyInstruction,
    TStoredData extends IRepositoryData<TNode, TId> = IRepositoryData<TNode, TId>,
    TUpdateError = IError,
    TRemoveError = IError,
    TRemoveOptions = {}
> extends AutoBind
    implements
        IRepository<
            TNode,
            TId,
            TInstruction,
            TStoredData,
            TUpdateError,
            TRemoveError,
            TRemoveOptions
        > {
    $IRepository: IRepository<
        TNode,
        TId,
        TInstruction,
        TStoredData,
        TUpdateError,
        TRemoveError,
        TRemoveOptions
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    > = undefined as any;

    readonly IBindableAsProp = true;
    readonly alreadyBound?: boolean;
    getNewVersion: IGetRepository<
        TNode,
        TId,
        TInstruction,
        TStoredData,
        TUpdateError,
        TRemoveError,
        TRemoveOptions
    >;

    protected readonly _setData: ISetData<TNode, TId, TInstruction, TStoredData>;
    protected readonly _params: IStandardParams<
        TNode,
        TId,
        TInstruction,
        TStoredData,
        TUpdateError,
        TRemoveError,
        TRemoveOptions
    > &
        Partial<INonStandardParams<TNode, TId>>;

    protected readonly _data: TStoredData;
    // protected readonly __dataSetter: IDataSetter<TNode, TId, TInstruction, TStoredData>;
    protected __nodeId?: number;
    protected __rootNodes?: TNode[];

    constructor(
        data: TStoredData | undefined,
        getRepo: IGetRepository<
            TNode,
            TId,
            TInstruction,
            TStoredData,
            TUpdateError,
            TRemoveError,
            TRemoveOptions
        >,
        setData: ISetData<TNode, TId, TInstruction, TStoredData>,
        params: IParams<
            TNode,
            TId,
            TInstruction,
            TStoredData,
            TUpdateError,
            TRemoveError,
            TRemoveOptions
        >
    );

    constructor(
        data: TStoredData | undefined,
        getRepo: IGetRepository<
            TNode,
            TId,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            any,
            TStoredData,
            TUpdateError,
            TRemoveError,
            TRemoveOptions
        >,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setData: ISetData<TNode, TId, any, TStoredData>,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        params: IParams<TNode, TId, any, TStoredData, TUpdateError, TRemoveError, TRemoveOptions>,
        __nodeId__: number
    );

    constructor(
        data: TStoredData | undefined,
        getRepo: IGetRepository<
            TNode,
            TId,
            TInstruction,
            TStoredData,
            TUpdateError,
            TRemoveError,
            TRemoveOptions
        >,
        setData: ISetData<TNode, TId, TInstruction, TStoredData>,
        params: IParams<
            TNode,
            TId,
            TInstruction,
            TStoredData,
            TUpdateError,
            TRemoveError,
            TRemoveOptions
        >,
        __nodeId__?: number
    );

    // eslint-disable-next-line max-params
    constructor(
        data: TStoredData | undefined,
        getRepo: IGetRepository<
            TNode,
            TId,
            TInstruction,
            TStoredData,
            TUpdateError,
            TRemoveError,
            TRemoveOptions
        >,
        setData: ISetData<TNode, TId, TInstruction, TStoredData>,
        params: IParams<
            TNode,
            TId,
            TInstruction,
            TStoredData,
            TUpdateError,
            TRemoveError,
            TRemoveOptions
        >,
        __nodeId__?: number
    ) {
        super();
        this._params = params;
        this._data = data || R.cast<TStoredData>(createData());
        this.getNewVersion = getRepo;
        this._setData = setData;
        this.__nodeId = __nodeId__;
        this.alreadyBound = !!__nodeId__;
    }

    /* istanbul ignore next */
    bindAsProp(
        nodeId: number
    ): Repository<
        TNode,
        TId,
        reduxCmp.IBoundInstruction,
        TStoredData,
        TUpdateError,
        TRemoveError,
        TRemoveOptions
    > {
        return new Repository<
            TNode,
            TId,
            reduxCmp.IBoundInstruction,
            TStoredData,
            TUpdateError,
            TRemoveError,
            TRemoveOptions
        >(
            this._data,
            R.cast<
                IGetRepository<
                    TNode,
                    TId,
                    reduxCmp.IBoundInstruction,
                    TStoredData,
                    TUpdateError,
                    TRemoveError,
                    TRemoveOptions
                >
            >(this.getNewVersion),
            R.cast<ISetData<TNode, TId, reduxCmp.IBoundInstruction, TStoredData>>(this._setData),
            this._params as IParams<
                TNode,
                TId,
                reduxCmp.IBoundInstruction,
                TStoredData,
                TUpdateError,
                TRemoveError,
                TRemoveOptions
            >,
            nodeId
        );
    }

    /* istanbul ignore next */
    asBindableProp() {
        return R.cast<
            Repository<
                TNode,
                TId,
                reduxCmp.IBoundInstruction,
                TStoredData,
                TUpdateError,
                TRemoveError,
                TRemoveOptions
            >
        >(this);
    }

    /* istanbul ignore next */
    commitNodes(
        ids: TId[] = this._data.newNodes,
        callback?: (changes?: Dictionary<Partial<TNode>>) => TInstruction
    ): TInstruction {
        return R.cast<TInstruction>(({ bindInstruction }: reduxCmp.IBindParams<TInstruction>) =>
            this.__commitNodes(ids, callback && (changes => bindInstruction(callback(changes))))
        );
    }

    /* istanbul ignore next */
    copyWithParams(
        transformParams: (
            params: IParams<
                TNode,
                TId,
                TInstruction,
                TStoredData,
                TUpdateError,
                TRemoveError,
                TRemoveOptions
            >
        ) => IParams<
            TNode,
            TId,
            TInstruction,
            TStoredData,
            TUpdateError,
            TRemoveError,
            TRemoveOptions
        >
    ): Repository<
        TNode,
        TId,
        TInstruction,
        TStoredData,
        TUpdateError,
        TRemoveError,
        TRemoveOptions
    > {
        return new Repository<
            TNode,
            TId,
            TInstruction,
            TStoredData,
            TUpdateError,
            TRemoveError,
            TRemoveOptions
        >(
            this._data,
            this.getNewVersion,
            this._setData,
            transformParams(
                this._params as IParams<
                    TNode,
                    TId,
                    TInstruction,
                    TStoredData,
                    TUpdateError,
                    TRemoveError,
                    TRemoveOptions
                >
            ),
            this.__nodeId
        );
    }

    /* istanbul ignore next */
    findNode(predicate: R.Pred<TNode>) {
        return findNode(this.tree, predicate);
    }

    /* istanbul ignore next */
    filterNodes(predicate: R.Pred<TNode>) {
        return filterNodes(this.tree, predicate);
    }

    /* istanbul ignore next */
    getId(node: TNode) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return this._params.getId ? this._params.getId(node) : ((node as any).id as TId);
    }

    // it's not pure!!
    /* istanbul ignore next */
    generateNewNodeId(parentNode?: TNode): TId {
        return R.cast<TId>(
            this._params.generateNewNodeId
                ? this._params.generateNewNodeId(generateClientId(), parentNode, this)
                : generateClientId()
        );
    }

    getNodeById(id: TId) {
        return immutableTree.getNodeBySimilar(this._data.tree, this.getId, id);
    }

    /* istanbul ignore next */
    getChildren(id?: TNode | TId, tree: immutableTree.ITree<TNode> = this._data.tree) {
        if (!id && tree === this._data.tree) return this.getRootNodes();

        if (typeof id === 'string' || typeof id === 'number') {
            const getId = this.getId;
            // eslint-disable-next-line eqeqeq
            return immutableTree.getChildren(tree, n => getId(n) == id);
        }
        return immutableTree.getChildren(tree, id as TNode | undefined);
    }

    /* istanbul ignore next */
    getDescendantsCount(id?: TNode | TId) {
        return this.getDescendants(id).length - 1;
    }

    /* istanbul ignore next */
    getDescendants(ids?: TNode | TId | Array<TNode | TId>): TNode[] {
        const _ids = ids
            ? R.clean(
                  R.toList(ids).map(id =>
                      typeof id === 'string' || typeof id === 'number'
                          ? this.getNodeById(id as TId)
                          : (id as TNode)
                  )
              )
            : undefined;

        let nodes: TNode[] = [];
        immutableTree.nodesAndEachDescendant(this.tree, n => (nodes = nodes.concat([n])), _ids);
        return nodes;
    }

    /* istanbul ignore next */
    getSiblings(ids: TId[]): TNode[] {
        return R.flatten(
            ids.map(id => {
                const parent = immutableTree.getParent(
                    this._data.tree,
                    (n: TNode) => id === this.getId(n)
                );
                return parent
                    ? immutableTree
                          .getChildren(this._data.tree, parent)
                          .filter(n => this.getId(n) !== id)
                    : R.emptyArray;
            })
        );
    }

    /* istanbul ignore next */
    getPrevSibling(id: TId): TNode | undefined {
        const node = this.getNodesByIds([id])[0];
        return node ? immutableTree.getPrevSibling(this._data.tree, node) : undefined;
    }

    /* istanbul ignore next */
    getNextSibling(id: TId): TNode | undefined {
        const node = this.getNodeById(id);
        return node ? immutableTree.getNextSibling(this._data.tree, node) : undefined;
    }

    /* istanbul ignore next */
    getNodesByIds(ids: TId[]) {
        return immutableTree.getNodesBySimilar(this._data.tree, this.getId, ids);
    }

    /* istanbul ignore next */
    findNodesByIds(ids: TId[], suppressNoNodesError = false): TNode[] {
        return suppressNoNodesError
            ? immutableTree.findNodesBySimilar(this._data.tree, this.getId, ids)
            : immutableTree.getNodesBySimilar(this._data.tree, this.getId, ids);
    }

    /* istanbul ignore next */
    getParentsMapByIds(ids: TId[]): Map<TId, TNode | undefined> {
        return new Map<TId, TNode | undefined>(
            ids.map(id =>
                R.tuple(
                    R.ensure(id),
                    immutableTree.getParent(this._data.tree, (n: TNode) => id === this.getId(n))
                )
            )
        );
    }

    /* istanbul ignore next */
    getParentById(id: TId): TNode | undefined {
        // eslint-disable-next-line eqeqeq
        return immutableTree.getParent(this._data.tree, (n: TNode) => id == this.getId(n));
    }

    /* istanbul ignore next */
    getParentNode(node: TNode): TNode | undefined {
        return immutableTree.getParent(this.tree, node);
    }

    // memoized
    /* istanbul ignore next */
    getRootNodes() {
        return (
            this.__rootNodes || (this.__rootNodes = immutableTree.getChildren(this.tree, undefined))
        );
    }

    /* istanbul ignore next */
    hasChildren(node: TNode | IRootNode = RootNode) {
        if (node === RootNode) return !immutableTree.isEmptyTree(this.tree);
        return immutableTree.hasChildren(this.tree, node);
    }

    /* istanbul ignore next */
    hasNewNodes() {
        return this.data.newNodes.length > 0 && this.data.newNodes.some(x => !!this.getNodeById(x));
    }

    /* istanbul ignore next */
    get data() {
        return this._data;
    }

    /* istanbul ignore next */
    isLeaf(node_: TNode | TId, tree: ITree<TNode> = this.tree) {
        const node =
            typeof node_ === 'string' || typeof node_ === 'number'
                ? this.getNodeById(node_ as TId)
                : (node_ as TNode);

        if (!node) return false;
        if (this.isLoaded(node, false, tree)) {
            return !immutableTree.hasChildren(tree, node);
        }
        return this._params.isLeaf ? this._params.isLeaf(node, tree) : false;
    }

    /* istanbul ignore next */
    isLoaded(node: TNode | IRootNode, checkIsLeaf = true, tree: ITree<TNode> = this.tree) {
        if (!node) {
            return this._data.loaded;
        }
        return (
            (!this._params.loadNodeChildren && !this._params.loadNodesChildren) ||
            (checkIsLeaf && this.isLeaf(node, tree)) ||
            !!this._data.loadedNodes[this.getId(node).toString()] ||
            immutableTree.hasChildren(tree, node)
        );
    }

    /* istanbul ignore next */
    isRecursivelyLoaded(nodes: IRootNode | TNode | TNode[], tree: ITree<TNode> = this.tree) {
        return immutableTree.nodesAndEveryDescendant(
            tree,
            x => this.isLoaded(x, undefined, tree),
            nodes === RootNode ? undefined : R.toList(nodes)
        );
    }

    /* istanbul ignore next */
    isRecursivelyLoadedById(nodeId?: TId) {
        return this.__isNodeLoaded(nodeId, true);
    }

    /* istanbul ignore next */
    getLoadedNodeIds(): TId[] {
        return R.keys(R.filter((v: boolean | undefined) => !!v, this.data.loadedNodes)) as TId[];
    }

    isLoading(nodeId: TId | IRootNodeId = RootNodeId) {
        return !!this._data.loadingNodes[nodeId];
    }

    /* istanbul ignore next */
    isNewNode(nodeId: TId) {
        return R.includesSimilar(nodeId, this._data.newNodes);
    }

    /* istanbul ignore next */
    load(
        params: ILoadParams<TNode, TInstruction> = {},
        cb?: (nodes: ITree<TNode>) => TInstruction
    ): TInstruction {
        return this.loadNodesChildren([RootNodeId], {
            ...params,
            eventType: 'init',
            cb: !cb ? undefined : ([{ children }]) => cb(children)
        });
    }

    // todo @noname [no-priority] don't load already loaded nodes on recursive loading
    loadNodesChildren(
        nodesIds: (TId | IRootNodeId)[],
        params: ILoadNodesChildrenParams<TNode, TId, TInstruction> = {}
    ): TInstruction {
        params = {
            ...params,
            recursive: !!params.recursive && !this._params.recursiveLoadingIsNotSupported
        };

        if (params.limit && !R.equals(nodesIds, [RootNodeId]))
            throw new RepositoryError('This case is not implemented!');

        return this.__queueAndRunNodesLoadingIfNeeded(
            nodesIds,
            params,
            (repo, notLoadedNodes, params) => {
                const { reload, limit, onError, eventType = 'other', recursive } = params;
                const { loadNodeChildren } = repo._params;
                let { loadNodesChildren } = repo._params;
                const childrenCount = reload ? 0 : repo.getRootNodes().length;

                if (!loadNodesChildren && loadNodeChildren) {
                    loadNodesChildren = convertLoadNodeChildrenToLoadNodesChildren(
                        loadNodeChildren
                    );
                }

                return loadNodesChildren!(
                    notLoadedNodes,
                    {
                        recursive,
                        eventType,
                        start: limit ? childrenCount : 0,
                        count: limit ? limit - childrenCount : undefined,
                        reload,
                        justRootNode: R.equals(notLoadedNodes, [RootNodeId]),
                        parentsWithoutRootNode: notLoadedNodes.filter(
                            x => x !== RootNodeId
                        ) as TId[]
                    },
                    response =>
                        response.caseOf({
                            left: error => {
                                /* istanbul ignore else  */
                                if (onError) return onError(error);
                                /* istanbul ignore next */
                                throw new RepositoryError('Error during nodes loading!');
                            },
                            right: result =>
                                this.__handleLoadNodesChildrenResult({
                                    result,
                                    nodesIds,
                                    notLoadedNodes,
                                    params
                                })
                        })
                );
            }
        );
    }

    loadNodeChildren(
        nodeId: TId,
        {
            cb,
            ...options
        }: {
            recursive?: boolean;
            force?: boolean;
            eventType?: IEventType;
            cb?: (nodeId: TId, children: ITree<TNode>) => TInstruction;
        } = {}
    ): TInstruction {
        return this.loadNodesChildren([nodeId], {
            ...options,
            cb: !cb ? undefined : ([{ nodeId, children }]) => cb(nodeId as TId, children)
        });
    }

    moveNodes(
        nodesIds: TId[],
        targetNodeId: TId | undefined,
        place?: IPlace,
        params?: IMoveParams<TId>
    ): TInstruction;

    moveNodes(
        nodesIds: TId[],
        parentNodeId: TId | undefined,
        posIndex: number,
        params?: IMoveParams<TId>
    ): TInstruction;

    /* istanbul ignore next */
    // eslint-disable-next-line max-params
    moveNodes(
        nodesIds: TId[],
        targetNodeId: TId | undefined,
        place?: number | IPlace,
        params?: IMoveParams<TId>
    ): TInstruction {
        return this._myGetRepo(repo => {
            const getId = repo.getId;
            const data = repo._data;
            const { tree } = repo._data;
            // let parentId: TId | undefined;
            let parentNode: TNode | undefined;
            let posIndex: number;
            let children: TNode[];
            const nodes = immutableTree.getNodesBySimilar(tree, getId, nodesIds);

            if (typeof place === 'number') {
                // parentId = clientTargetId;
                parentNode = immutableTree.getNodeBySimilar(tree, getId, targetNodeId);
                posIndex = place;
                children = immutableTree.getChildren(tree, parentNode);
            } else {
                if (!place) {
                    place = 'append';
                }

                const targetNode = immutableTree.getNodeBySimilar(
                    tree,
                    getId,
                    targetNodeId
                ) as TNode;
                if (place === 'append' || place === 'prepend') {
                    // parentId = clientTargetId;
                    parentNode = targetNode;
                } else {
                    parentNode = immutableTree.getParent(tree, targetNode);
                    // parentId = parentNode && getId(parentNode);
                }

                // todo @noname [no-priority] toggle node
                // await actions.toggleNode({ nodeId: parentId, expand: true, eventType: 'move' });
                // tree = R.ensure(getState().tree);

                children = immutableTree.getChildren(tree, parentNode);
                posIndex = R.cond([
                    [R.equals('append'), R.always(children.length)],
                    [R.equals('prepend'), R.always(0)],
                    [R.equals('before'), () => children.indexOf(targetNode)],
                    [R.equals('after'), () => children.indexOf(targetNode) + 1]
                ])(place);
            }

            //if moving doesn't make any sense
            // const nodesParents = nodes.map(x => immutableTree.getParent(tree, x));
            // if (R.uniqWith(R.identical, nodesParents).length === 1) {
            //     const nodesPositions = nodes.map(x => immutableTree.getPosition(tree, x));
            //     nodesPositions.sort();
            //     const firstNodePosition = nodesPositions[0];

            //     //are positions consecutive
            //     if (nodesPositions.every((x, i) => x - firstNodePosition - i === 0) &&
            //         posIndex >= nodesPositions[0] &&
            //         posIndex <= R.trust(R.last(nodesPositions)) + 1) {
            //         return null as TInstruction;
            //     }
            // }

            const oldParent = params
                ? repo.getNodeById(params.oldParentId)
                : repo.getParentById(nodesIds[0]);
            const newTree = repo._params.moveTreeNodes
                ? repo._params.moveTreeNodes(
                      repo._data.tree,
                      parentNode,
                      posIndex,
                      nodes,
                      oldParent
                  )
                : immutableTree.moveNodes(repo._data.tree, parentNode, posIndex, nodes);

            return transaction<TInstruction>(({ rollback }) =>
                seq<TInstruction>([
                    repo._setData(
                        R.merge(data, {
                            tree: newTree,
                            total: calculateTotal(data.total, data.tree, newTree),
                            justMoved: nodesIds
                        })
                    ),
                    this.queue('edit', nodes.map(repo.getId), repo => {
                        const restNodes = R.clean(
                            immutableTree.getNodesBySimilar(tree, repo.getId, nodesIds)
                        );
                        return restNodes.length > 0 && repo._params.moveNodes
                            ? repo._params.moveNodes(
                                  restNodes,
                                  parentNode,
                                  oldParent,
                                  posIndex,
                                  posIndex -
                                      R.intersection(children.slice(0, posIndex), nodes).length,
                                  result =>
                                      result.caseOf({
                                          left: _ => rollback as TInstruction,
                                          right: () => null as TInstruction
                                      })
                              )
                            : (null as TInstruction);
                    })
                ])
            );
        });
    }

    /* istanbul ignore next */
    // eslint-disable-next-line max-params
    insertNodes(
        nodes: TNode[] | ITree<TNode>,
        {
            insertAfterId,
            parentNodeId,
            position,
            keepAsPhantom,
            dontGenerateIds,
            noRequest
        }: IInsertNodesParams<TId> = {},
        onInserted?: (nodes: TNode[]) => TInstruction,
        callback?: (changes?: Dictionary<Partial<TNode>>) => TInstruction
    ): TInstruction {
        return this.insertNodesBunch(
            [{ nodes, insertAfterId, parentNodeId, position }],
            { keepAsPhantom, dontGenerateIds, noRequest },
            onInserted && (([nodes]) => onInserted(nodes)),
            callback
        );
    }

    // !fix performance
    /* istanbul ignore next */
    // eslint-disable-next-line max-params
    insertNodesBunch(
        bunch: ({ nodes: TNode[] | ITree<TNode> } & IInsertPlace<TId>)[],
        { keepAsPhantom, dontGenerateIds, noRequest }: IInsertNodesBunchParams = {},
        onInserted?: (bunch: TNode[][]) => TInstruction,
        callback?: (changes?: Dictionary<Partial<TNode>>) => TInstruction
    ): TInstruction {
        return R.cast<TInstruction>(({ bindInstruction }: reduxCmp.IBindParams<TInstruction>) =>
            extCall(
                () =>
                    bunch.map(b => ({
                        ...b,
                        ids: dontGenerateIds
                            ? undefined
                            : flattenSubTree(b.nodes).map(() => generateClientId())
                    })),

                bunch =>
                    this._myGetRepo(repo => {
                        let { tree } = repo._data;
                        const oldTree = tree;
                        const data = repo.data;
                        const getId = repo.getId;

                        // console.time('inb cache ids');
                        // console.timeEnd('inb cache ids');
                        // const measure = new Measure('inb');
                        // console.time('inb');
                        // immutableTree.cashIds(tree, getId);
                        const newNodesBunch = bunch.map(
                            ({ nodes, ids, insertAfterId, parentNodeId, position }) => {
                                let subTree = immutableTree.isTree(nodes)
                                    ? nodes
                                    : immutableTree.createTreeFromArray(nodes);
                                // measure.begin();
                                // !fix performance >
                                let parentNode: TNode | undefined;
                                if (insertAfterId) {
                                    const node = immutableTree.getNodeBySimilar(
                                        tree,
                                        getId,
                                        insertAfterId
                                    ) as TNode;
                                    // measure.step('1 getNodeBySimilar');
                                    parentNode = immutableTree.getParent(tree, node);
                                    // measure.step('1 getParent');
                                    position =
                                        immutableTree.getPosition(
                                            tree,
                                            // eslint-disable-next-line eqeqeq
                                            x => insertAfterId == getId(x)
                                        ) + 1;
                                    // measure.step('1 getPosition');
                                } else {
                                    parentNode =
                                        parentNodeId &&
                                        immutableTree.getNodeBySimilar(tree, getId, parentNodeId);
                                    // measure.step('2 getNodeBySimilar');
                                    if (position === undefined) {
                                        position = immutableTree.getChildren(tree, parentNode)
                                            .length;
                                        // measure.step('2 getChildren');
                                    }
                                }
                                // <

                                if (ids) {
                                    subTree = immutableTree.mapTree(subTree, (x, i) => {
                                        const randStr = ids[i];
                                        const id = repo._params.generateNewNodeId
                                            ? repo._params.generateNewNodeId(
                                                  randStr,
                                                  parentNode,
                                                  repo
                                              )
                                            : randStr;

                                        return repo.__setId(id as TId, x);
                                    });
                                }
                                // measure.skip();
                                // !fix performance >
                                tree = repo._params.insertTreeNodes
                                    ? repo._params.insertTreeNodes(
                                          tree,
                                          parentNode,
                                          position,
                                          subTree
                                      )
                                    : immutableTree.insertSubTree(
                                          tree,
                                          parentNode,
                                          position,
                                          subTree
                                      );
                                // <
                                // measure.step('insert');
                                return immutableTree.flattenSubTree(subTree);
                            }
                        );

                        const nodes = R.unnest(newNodesBunch);
                        const ids = nodes.map(repo.getId);
                        const clientIds = (ids as HashKey[]) as TId[];
                        // let idToHasChildrenMap: StrongDictionary<boolean> = {};
                        // convertToTraditionalTree(
                        //     tree,
                        //     (n, children) => {
                        //         const id = getId(n);
                        //         idToHasChildrenMap[id] = !children.length;
                        //         return n;
                        //     }
                        // );
                        const result = (seq([
                            repo._setData(
                                R.merge(
                                    data,
                                    R.typed<Partial<IRepositoryData<TNode, TId>>>({
                                        tree,
                                        newNodes: noRequest
                                            ? data.newNodes
                                            : data.newNodes.concat(clientIds),
                                        total: calculateTotal(data.total, oldTree, tree),
                                        justInserted: clientIds,
                                        loadedNodes: R.setProps(
                                            R.mapArrayIntoObjIndexed(
                                                (n, i) => ({
                                                    [ids[i]]: this.isLeaf(n, tree) // || idToHasChildrenMap[getId(n)]
                                                }),
                                                nodes
                                            ),
                                            data.loadedNodes
                                        )
                                        //loadedNodes: R.setProps(R.mapArrayIntoObj(x => ({ [x]: true }), clientIds), data.loadedNodes)
                                    })
                                )
                            ),
                            onInserted && onInserted(newNodesBunch),
                            repo._params.onNodesInserted && repo._params.onNodesInserted(nodes),

                            !noRequest &&
                                !keepAsPhantom &&
                                repo.__commitNodes(
                                    clientIds,
                                    callback && (changes => bindInstruction(callback(changes)))
                                )
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        ]) as any) as TInstruction;

                        return result;
                    })
            )
        );
    }

    /* istanbul ignore next */
    queue(
        kind: 'load' | 'edit',
        nodesIds: (TId | IRootNodeId)[],
        callback?: (
            repo: Repository<
                TNode,
                TId,
                TInstruction,
                TStoredData,
                TUpdateError,
                TRemoveError,
                TRemoveOptions
            >
        ) => TInstruction
    ): TInstruction {
        return this._myGetRepo(repo =>
            seq([
                repo.data.repoId
                    ? (null as TInstruction)
                    : repo._setData(R.setProp('repoId', R.uniqueId().toString(), repo.data)),
                repo.getNewVersion(repo =>
                    queue(
                        nodesIds.map(
                            x =>
                                `common-redux-repository-${repo.data.repoId ||
                                    ''}-${kind}-${x.toString()}`
                        ),
                        callback && repo.getNewVersion(callback)
                    )
                )
            ])
        );
    }

    /* istanbul ignore next */
    getAllParentsOfNodes(nodeIds: TId[]) {
        return R.clean(R.uniq(nodeIds.map(this.getParentById)));
    }

    /* istanbul ignore next */
    removeNodes(
        nodesIds: TId[],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        options: IModificationOptions<TNode, TInstruction, TRemoveError, TRemoveOptions> = {} as any
    ): TInstruction {
        // eslint-disable-next-line unicorn/explicit-length-check
        if (!nodesIds.length) {
            return R.cast<TInstruction>(options.onSuccess ? options.onSuccess([]) : undefined);
        }

        const pessimistic = options.pessimistic === true;

        return R.cast<TInstruction>(({ bindInstruction }: reduxCmp.IBindParams<TInstruction>) =>
            this._myGetRepo(repo => {
                const { tree } = repo._data;
                const data = repo._data;
                const nodes = immutableTree.findNodesBySimilar(tree, repo.getId, nodesIds);
                const newTree = repo._params.removeTreeNodes
                    ? repo._params.removeTreeNodes(data.tree, nodes)
                    : immutableTree.removeNodes(data.tree, nodes);
                const { onBeforeRemoveNodes } = repo._params;

                const setDataInstructions = () =>
                    repo._setData(
                        R.merge(data, {
                            tree: newTree,
                            justRemoved: R.uniqWith(
                                R.isSimilarTo,
                                flattenNodes(tree, nodes).map(repo.getId)
                            ),
                            total: calculateTotal(data.total, data.tree, newTree),
                            newNodes: !options.noRequest
                                ? repo._data.newNodes
                                : R.differenceByKey(x => x, repo._data.newNodes, nodesIds),
                            loadedNodes: R.omit(nodesIds as string[], repo._data.loadedNodes)
                        })
                    );

                const performUpdatesInstructions = () =>
                    !options.noRequest &&
                    this.queue('edit', nodesIds, repo => {
                        const realNodes = nodes.filter(
                            x => !R.includesSimilar(repo.getId(x), repo._data.newNodes)
                        );

                        return realNodes.length === 0
                            ? repo._setData(
                                  R.merge(repo._data, {
                                      newNodes: R.differenceByKey(
                                          x => x,
                                          repo._data.newNodes,
                                          nodesIds
                                      )
                                  })
                              )
                            : seq([
                                  R.cast<TInstruction>(
                                      repo._params.removeNodes &&
                                          repo._params.removeNodes(
                                              realNodes,
                                              tree,
                                              result =>
                                                  R.cast<TInstruction>(
                                                      result.caseOf({
                                                          left: e => {
                                                              if (options.onError) {
                                                                  return bindInstruction(
                                                                      options.onError(e)
                                                                  );
                                                              }
                                                              throw new Error(
                                                                  'Error during nodes removing!'
                                                              );
                                                          },
                                                          right: () =>
                                                              options.onSuccess &&
                                                              bindInstruction(
                                                                  options.onSuccess(nodes)
                                                              )
                                                      })
                                                  ),
                                              options
                                          )
                                  ),
                                  this.getNewVersion(repo =>
                                      repo._setData(
                                          R.merge(
                                              repo._data,
                                              R.typed<Partial<IRepositoryData<TNode, TId>>>({
                                                  newNodes: R.differenceByKey(
                                                      R.identity,
                                                      repo._data.newNodes,
                                                      nodesIds
                                                  )
                                              })
                                          )
                                      )
                                  )
                              ]);
                    });

                return R.cast<TInstruction>(
                    seq(
                        pessimistic
                            ? [
                                  onBeforeRemoveNodes && onBeforeRemoveNodes(nodes),
                                  performUpdatesInstructions,
                                  setDataInstructions
                              ]
                            : [
                                  onBeforeRemoveNodes && onBeforeRemoveNodes(nodes),
                                  setDataInstructions,
                                  performUpdatesInstructions
                              ]
                    )
                );
            })
        );
    }

    /* istanbul ignore next */
    setTree(tree: ITree<TNode>, total?: number) {
        return this.setData({ tree } as Partial<TStoredData>, total);
    }

    /* istanbul ignore next */
    setData(data: Partial<TStoredData>, total?: number) {
        return this._myGetRepo(repo => {
            const { tree = repo.tree } = data;
            // let justPart: Partial<IRepositoryData<TNode, TId>>;
            // if (tree === repo.tree) {
            //     justPart = { justRemoved: R.emptyArray, justInserted: R.emptyArray };
            // }
            // else {
            //     // todo @noname [no-priority] fix performance
            //     const oldIds = flattenSubTree(repo.tree).map(this.getClientIdByNode);
            //     const newIds = flattenSubTree(tree).map(this.getClientIdByNode);
            //     justPart = {
            //         justRemoved: R.differenceByKey(R.identity, oldIds, newIds),
            //         justInserted: R.differenceByKey(R.identity, newIds, oldIds)
            //     };
            // }
            const result = repo._setData({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...(repo._data as any),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...(data as any),
                // ...justPart,
                loaded: !immutableTree.isEmptyTree(tree),
                tree,
                total:
                    total !== undefined
                        ? total
                        : calculateTotal(repo._data.total, repo._data.tree, tree),
                justSetData: repo._data.justSetData + 1
                // loaded nodes updating is not trivial...
                // loadedNodes: tree === repo._data.tree ? repo._data.loadedNodes : immutableTree.filterNodes(
                //     tree,
                //     n => immutableTree.hasChildren(tree, n)
                // ).map(repo.getId)
            });
            return result;
        });
    }

    /* istanbul ignore next */
    setId(id: TId, node: TNode) {
        return this.__setId(id, node);
    }

    stopLoading(): TInstruction {
        return this._myGetRepo(repo =>
            this._setData(
                R.setProps(
                    {
                        loadingEnabled: false,
                        loadingNodes: R.emptyObject
                    } as Partial<TStoredData>,
                    repo.data
                )
            )
        );
    }

    /* istanbul ignore next */
    get tree() {
        return this._data.tree;
    }

    /* istanbul ignore next */
    updateNodesBy(
        nodeIds: TId[],
        updater: (n: TNode) => Partial<TNode>,
        options: IModificationOptions<TNode, TInstruction, TUpdateError>
    ): TInstruction {
        const updates = R.clean(
            this.getNodesByIds(nodeIds).map(n => {
                const u = updater(n);
                return u !== n ? R.tuple(this.getId(n), u) : null;
            })
        );

        return this.updateNodes(R.fromPairs(updates), options);
    }

    /* istanbul ignore next */
    updateNode(
        nodeId: TId,
        changes: Partial<TNode>,
        options: IModificationOptions<TNode, TInstruction, TUpdateError> = {}
    ): TInstruction {
        return this.updateNodes({ [nodeId.toString()]: changes }, options);
    }

    updateNodes(
        idToChanges: StrongDictionary<Partial<TNode>>,
        options?: IModificationOptions<TNode, TInstruction, TUpdateError>
    ): TInstruction;

    updateNodes(
        idToChanges: ([TId, Partial<TNode>] | TNode)[],
        options?: IModificationOptions<TNode, TInstruction, TUpdateError>
    ): TInstruction;

    /* istanbul ignore next */
    updateNodes(
        idToChanges_: ([TId, Partial<TNode>] | TNode)[] | StrongDictionary<Partial<TNode>>,
        options: IModificationOptions<TNode, TInstruction, TUpdateError> = {}
    ): TInstruction {
        if (R.isEmpty(idToChanges_)) {
            return seq([]);
        }
        return R.cast<TInstruction>(({ bindInstruction }: reduxCmp.IBindParams<TInstruction>) =>
            this._myGetRepo(repo => {
                let idToChanges: StrongDictionary<Partial<TNode>> = Array.isArray(idToChanges_)
                    ? R.fromPairs(
                          idToChanges_.map(node =>
                              Array.isArray(node)
                                  ? node
                                  : R.tuple(
                                        this.getId(node),
                                        R.objShallowDifference(
                                            node,
                                            repo.getNodeById(this.getId(node)) || {}
                                        )
                                    )
                          )
                      )
                    : idToChanges_;

                let { tree } = repo._data;
                // let wasHashChange = false;
                if (options.noRequest) {
                    idToChanges = R.filterDictionaryIndexed(
                        (_, k) => !!repo.getNodeById(k as TId),
                        idToChanges
                    );
                }
                if (R.isEmpty(idToChanges)) {
                    return null as TInstruction;
                }

                const nodes: StrongDictionary<TNode> = {};
                // todo @noname [no-priority] don't send requests if there were not changes. But consider situation when noRequest flag was passed earlier
                // todo @noname [no-priority] is this logic needed
                R.objEach((changes, id_) => {
                    const id = id_ as TId;
                    const node = R.ensure(repo.getNodeById(id));
                    nodes[id as string] = node;
                    if (
                        node &&
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        !R.objEvery((value, key) => (node as any)[key] === value, changes)
                    ) {
                        tree = (repo._params.updateTreeNode || immutableTree.updateNode)(
                            tree,
                            node,
                            changes
                        );
                        // const newId = repo.getId(R.merge(node, changes));
                        //
                        // if (newId as HashKey != id) {
                        //     if (!wasHashChange) {
                        //         serverToClientIds = R.clone(serverToClientIds);
                        //         newNodes = newNodes.concat();
                        //         justInserted = justInserted.concat();
                        //         wasHashChange = true;
                        //     }
                        //     if (serverToClientIds[id]) {
                        //         delete serverToClientIds[id];
                        //         serverToClientIds[newId.toString()] = id;
                        //     }
                        //     if (newNodes.includes(id)) {
                        //         newNodes = R.removeSimilarEl(id as any, newNodes).concat([newId]);
                        //     }
                        //     if (justInserted.includes(id as any)) {
                        //         justInserted = R.removeSimilarEl(id as any, justInserted).concat([newId]);
                        //     }
                        // }
                    }
                }, idToChanges);

                const ids = R.keys(idToChanges) as TId[];
                return seq([
                    repo._setData(
                        R.merge(repo._data, {
                            tree,
                            justUpdated: ids
                        })
                    ),
                    // !repo.__params.onNodesUpdated ? R.cast<TInstruction>(undefined) :
                    //     repo.__params.onNodesUpdated(idToChanges, repo),
                    this.queue('edit', ids, repo => {
                        const actualNodes = R.clean(
                            ids.filter(R.complement(repo.isNewNode)).map(repo.getNodeById)
                        );
                        const fireOnNodesChanged = () =>
                            // eslint-disable-next-line unicorn/explicit-length-check
                            !repo._params.onNodesUpdated || !actualNodes.length
                                ? R.cast<TInstruction>(null)
                                : repo._params.onNodesUpdated(
                                      actualNodes.map(x => ({
                                          node: x,
                                          oldNode: nodes[repo.getId(x)],
                                          changes: idToChanges[repo.getId(x)]
                                      }))
                                  );

                        // eslint-disable-next-line unicorn/explicit-length-check
                        if (!actualNodes.length || !repo._params.updateNodes || options.noRequest) {
                            return fireOnNodesChanged();
                        }

                        const instruction = repo._params.updateNodes(
                            actualNodes,
                            actualNodes
                                .map(repo.getId)
                                .map(String)
                                .map(x => ({
                                    changes: idToChanges[x],
                                    // todo @noname [no-priority] remove this hack as soon as grid is rewritten
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    oldNode: (options as any).__hackOldNode__ || nodes[x]
                                })),

                            result =>
                                R.cast<TInstruction>(
                                    result.caseOf({
                                        left: e => {
                                            if (options.onError) {
                                                return bindInstruction(options.onError(e));
                                            }
                                            throw new Error('Error during node updating!');
                                        },
                                        right: () =>
                                            parallel([
                                                options.onSuccess &&
                                                    bindInstruction(options.onSuccess(actualNodes)),
                                                fireOnNodesChanged()
                                            ])
                                    })
                                )
                        );

                        if (!options.debounce) {
                            return instruction;
                        }

                        const changedIds = R.keys(idToChanges);
                        const changedFields = R.uniqByKey<string>(
                            R.identity,
                            R.flatten(R.values(idToChanges).map(R.keys))
                        ).sort();

                        return debounce(
                            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                            `common-redux-repository-${repo.data.repoId}-${changedFields.join(
                                ','
                            )}-${changedIds.join(',')}-updateNodes`,
                            options.debounce,
                            instruction
                        );
                    })
                ]);
            })
        );
    }

    protected _myGetRepo: IGetRepository<
        TNode,
        TId,
        TInstruction,
        TStoredData,
        TUpdateError,
        TRemoveError,
        TRemoveOptions
    > = fn => this.__wrapInstruction(this.getNewVersion(fn));

    /* istanbul ignore next */
    protected _mySetData: ISetData<TNode, TId, TInstruction, TStoredData> = data =>
        this.__wrapInstruction(this._setData(data));

    private __queueAndRunNodesLoadingIfNeeded(
        nodesIds: (TId | IRootNodeId)[],
        params: ILoadNodesChildrenParams<TNode, TId, TInstruction>,
        loadingCallback: (
            repo: Repository<
                TNode,
                TId,
                TInstruction,
                TStoredData,
                TUpdateError,
                TRemoveError,
                TRemoveOptions
            >,
            notLoadedNodes: (TId | IRootNodeId)[],
            params: ILoadNodesChildrenParams<TNode, TId, TInstruction>
        ) => TInstruction
    ): TInstruction {
        return seq([
            this._myGetRepo(repo =>
                !repo.data.loadingEnabled
                    ? repo._setData(R.setProp('loadingEnabled', true, repo.data))
                    : (null as TInstruction)
            ),
            this.queue('load', nodesIds, repo => {
                if (!repo.data.loadingEnabled) return null as TInstruction;

                let notLoadedNodes = repo.__getNotLoadedNodes(nodesIds, params);

                if (notLoadedNodes.length === 0) {
                    return repo.__callCallbacksForNotLoadedNodes(nodesIds, params);
                }

                ({ notLoadedNodes, params } = repo.__checkIfNeedToLoadRootRecursively(
                    notLoadedNodes,
                    params
                ));

                return seq([
                    repo._setData(
                        R.setProps(
                            {
                                loadingNodes: R.setProps(
                                    R.fromPairs(notLoadedNodes.map(x => [x, true])),
                                    repo._data.loadingNodes
                                ),
                                loadingEnabled: true
                            } as Partial<TStoredData>,
                            repo._data
                        )
                    ),

                    exitBy(
                        callback => this.getNewVersion(repo => callback(!repo.data.loadingEnabled)),
                        loadingCallback(repo, notLoadedNodes, params)
                    ),

                    this.getNewVersion(repo =>
                        repo._setData(
                            R.setProp(
                                'loadingNodes',
                                R.omit(notLoadedNodes, repo._data.loadingNodes),
                                repo._data
                            )
                        )
                    )
                ]);
            })
        ]);
    }

    private __checkIfNeedToLoadRootRecursively(
        notLoadedNodes: (TId | IRootNodeId)[],
        params: ILoadNodesChildrenParams<TNode, TId, TInstruction>
    ) {
        const data = this._params.loadRootRecursivelyIfRequestedNodesCountMoreThan;
        const { count, root = RootNodeId } =
            typeof data === 'number' ? { count: data } : data ? data : { count: undefined };

        if (
            count !== undefined &&
            notLoadedNodes.length > count &&
            !this._params.recursiveLoadingIsNotSupported
        ) {
            params = {
                ...params,
                recursive: true
            };
            notLoadedNodes = [root];
        }
        return { notLoadedNodes, params };
    }

    private __getNotLoadedNodes(
        nodesIds: (TId | IRootNodeId)[],
        { recursive, reload, limit }: ILoadNodesChildrenParams<TNode, TId, TInstruction>
    ) {
        const { loadNodeChildren, loadNodesChildren } = this._params;
        const childrenCount = reload ? 0 : this.getRootNodes().length;

        const rootNodeRequested = nodesIds.includes(RootNodeId);
        const allPagedNodesLoaded = () =>
            limit &&
            rootNodeRequested &&
            !reload &&
            this.__isNodeLoaded(undefined, recursive) &&
            (totalIsKnown(this._data.total)
                ? childrenCount >= this._data.total
                : childrenCount >= limit);

        return (!loadNodeChildren && !loadNodesChildren) || allPagedNodesLoaded()
            ? []
            : reload || rootNodeRequested
            ? nodesIds.filter(x => x === RootNodeId || !this.isLeaf(x))
            : nodesIds.filter(x => !this.__isNodeLoaded(ensureNotRootId(x), recursive));
    }

    private __normalizeLoadedData(
        data: ILoadNodesComplexResponse<TNode, TStoredData>['data'],
        notLoadedNodes: (TId | IRootNodeId)[]
    ): INormalizedLoadedResult<TNode, TId> {
        const transform = this._params.transformLoadedNodes || R.getIdentity();

        const dataNormalized = immutableTree.convertableToTree(data)
            ? {
                  [notLoadedNodes[0]]: data
              }
            : data;

        return R.fromPairs(
            notLoadedNodes.map(id => {
                const node =
                    id === RootNodeId
                        ? undefined
                        : immutableTree.getNodeBy(this._data.tree, this.getId, id);

                const children =
                    dataNormalized[id] && immutableTree.castToTree(dataNormalized[id]!);

                return [
                    id,
                    {
                        id,
                        node,
                        children: children && transform(children),
                        nodesLoadedRecursively:
                            id === RootNodeId
                                ? this.isRecursivelyLoaded(null)
                                : !!node && this.isRecursivelyLoaded(node)
                    }
                ];
            })
        );
    }

    private __calcUpdatesByLoadedNodes({
        nodesIds,
        loadedChildren,
        params: { reload, limit, recursive },
        store,
        total
    }: {
        nodesIds: (TId | IRootNodeId)[];
        params: ILoadNodesChildrenParams<TNode, TId, TInstruction>;
        loadedChildren: INormalizedLoadedResult<TNode, TId>;
        store: Partial<TStoredData> | undefined;
        total: number | undefined;
    }) {
        const updates: Partial<IRepositoryData<TNode, TId>> = {
            loaded: nodesIds.includes(RootNodeId) ? true : this._data.loaded,

            loadedNodes: this.__addLoadedNodesFromResults(
                R.clean(
                    R.mapObjIntoArray(
                        x =>
                            x.children && {
                                result: x.children,
                                recursive: !!(recursive && x.nodesLoadedRecursively)
                            },
                        loadedChildren
                    )
                ),
                reload
                    ? undefined
                    : [this._data.loadedNodes, R.keys(this._data.cache), R.keys(loadedChildren)]
            ),
            justChildrenLoaded: R.keys(loadedChildren) as (TId | IRootNodeId)[],
            cache: reload
                ? R.emptyObject
                : {
                      ...this._data.cache,
                      ...R.mapObjIndexed(({ children }) => children, loadedChildren)
                  },
            ...store
        };

        if (limit && !reload) {
            updates.tree = immutableTree.appendSubTree(
                this._data.tree,
                undefined,
                R.ensure(R.values(loadedChildren)[0].children)
            );
        } else {
            updates.tree = insertLoadedChildrenToTree({
                tree: this._data.tree,
                getId: this.getId,
                loadedChildren
            });
        }

        updates.total =
            total !== undefined ? total : immutableTree.getChildren(updates.tree, undefined).length;

        if (total === -1 && limit) {
            const actualSize = immutableTree.getChildren(updates.tree, undefined).length;
            if (actualSize < limit) updates.total = actualSize;
        }

        updates.tree = this.__takeNodesFromCache({ tree: updates.tree, cache: updates.cache! });

        return updates as Partial<TStoredData>;
    }

    private __callCallbacksForLoadedNodes(
        rootTree: immutableTree.ITree<TNode>,
        loadedChildren: INormalizedLoadedResult<TNode, TId>,
        { cb, recursive }: ILoadNodesChildrenParams<TNode, TId, TInstruction>
    ): TInstruction {
        const { onNodesLoaded } = this._params;
        if (!onNodesLoaded && !cb) return null as TInstruction;

        const argumentsForCallback = R.mapObjIntoArray(
            ({ children, node }, id) => ({
                children:
                    id === RootNodeId
                        ? R.ensure(children)
                        : children && node
                        ? children
                        : immutableTree.getSubTree(rootTree, x => this.getId(x) === id),
                nodeId: id as TId | IRootNodeId
            }),
            loadedChildren
        );

        return seq([
            onNodesLoaded &&
                parallel(
                    argumentsForCallback.map(({ children, nodeId }) =>
                        onNodesLoaded(
                            children,
                            nodeId === RootNodeId ? undefined : nodeId,
                            recursive
                        )
                    )
                ),

            cb && cb(argumentsForCallback)
        ]);
    }

    private __callCallbacksForNotLoadedNodes(
        nodesIds: (TId | IRootNodeId)[],
        { cb, limit, recursive }: ILoadNodesChildrenParams<TNode, TId, TInstruction>
    ): TInstruction {
        if (cb) {
            const nodesAndChildren = nodesIds.map(id => ({
                nodeId: id,
                children:
                    id !== RootNodeId
                        ? recursive
                            ? immutableTree.getSubTree(this.tree, x => this.getId(x) === id)
                            : immutableTree.createTreeFromArray(this.getChildren(id))
                        : limit
                        ? emptyTree
                        : recursive
                        ? this.tree
                        : immutableTree.createTreeFromArray(this.getRootNodes())
            }));
            return cb(nodesAndChildren);
        }
        return null as TInstruction;
    }

    private __handleLoadNodesChildrenResult({
        result,
        nodesIds,
        notLoadedNodes,
        params
    }: {
        result: ILoadNodesResponse<TNode, TStoredData>;
        nodesIds: (TId | IRootNodeId)[];
        notLoadedNodes: (TId | IRootNodeId)[];
        params: ILoadNodesChildrenParams<TNode, TId, TInstruction>;
    }) {
        return this.getNewVersion(repo => {
            const complexResult = immutableTree.convertableToTree(result)
                ? {
                      data: result,
                      total: undefined,
                      store: undefined
                  }
                : result;

            const { data, total, store } = complexResult;

            const loadedChildren = repo.__normalizeLoadedData(data, notLoadedNodes);

            const updates = repo.__calcUpdatesByLoadedNodes({
                loadedChildren,
                nodesIds,
                params,
                store,
                total
            });

            return seq([
                repo._setData(R.setProps<TStoredData>(updates, repo._data)),
                repo.__callCallbacksForLoadedNodes(R.ensure(updates.tree), loadedChildren, params)
            ]);
        });
    }

    private __addLoadedNodesFromResults(
        results: {
            result: ITree<TNode>;
            recursive: boolean;
        }[],
        loadedNodesSources: (Dictionary<boolean> | DictKey[])[] = []
    ) {
        const loadedNodes = loadedNodesSources.reduce<Dictionary<boolean>>(
            (loadedNodes, source) => ({
                ...loadedNodes,
                ...(Array.isArray(source)
                    ? R.fromPairs(source.map(id => [id.toString(), true]))
                    : R.pickBy(R.isTruthy, source))
            }),
            {}
        );

        return results.reduce<Dictionary<boolean>>(
            (loadedNodes, { result, recursive }) =>
                this.__addLoadedNodesFromResult(result, loadedNodes, recursive),
            loadedNodes
        );
    }

    private __addLoadedNodesFromResult(
        result: ITree<TNode>,
        loadedNodes: Dictionary<boolean>,
        recursive: boolean
    ) {
        if (recursive) {
            loadedNodes = R.merge(
                loadedNodes,
                R.mapArrayIntoObj(
                    node => ({ [this.getId(node).toString()]: true }),
                    immutableTree.flattenSubTree(result)
                )
            );
        } else {
            const extraLoadedNodes: Dictionary<boolean> = {};
            iterateDescendants(
                result,
                R.T,
                ({ parent }) => {
                    if (parent) extraLoadedNodes[this.getId(parent)] = true;
                },
                undefined
            );

            if (!R.isEmpty(extraLoadedNodes)) {
                loadedNodes = R.merge(loadedNodes, extraLoadedNodes);
            }
        }
        return loadedNodes;
    }

    /* istanbul ignore next */
    private __commitNodes(
        ids: TId[] = this._data.newNodes,
        callback?: (
            changes?: Dictionary<Partial<TNode>>
        ) => TInstruction | reduxCmp.IBoundInstruction
    ): TInstruction {
        // eslint-disable-next-line unicorn/explicit-length-check
        if (!ids.length) {
            return R.cast<TInstruction>(undefined);
        }

        return this.queue('edit', ids, repo => {
            const { createNodes } = repo._params;
            const nodes = immutableTree.getNodesBySimilarSorted(repo._data.tree, repo.getId, ids);

            // eslint-disable-next-line unicorn/explicit-length-check
            return !createNodes || !nodes.length
                ? repo._setData(
                      R.merge(repo._data, {
                          newNodes: R.differenceByKey(x => x, repo._data.newNodes, ids)
                      })
                  )
                : createNodes(
                      nodes.map(n => ({ node: n })),
                      repo._data,
                      result =>
                          this.getNewVersion(repo => {
                              const changes = R.eitherThrowOrGet(
                                  'Error during nodes creating!',
                                  result
                              );
                              const data = repo._data;

                              if (changes) {
                                  let tree = data.tree;
                                  const newNodesData = changes; //R.fromPairs(nodes.map((x, i) => R.tuple(repo.getId(x), changes[i])));

                                  for (const [id, data] of R.toPairs(newNodesData)) {
                                      tree = immutableTree.updateNode(
                                          tree,
                                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                          R.resultSimilar(repo.getId, (id as any) as TId),
                                          node => {
                                              const newNode = R.merge(node, data);
                                              return newNode;
                                          }
                                      );
                                  }

                                  return (seq([
                                      repo._setData(
                                          R.merge(data, {
                                              tree,
                                              justUpdated: ids,
                                              newNodes: R.differenceByKey(
                                                  x => x,
                                                  data.newNodes,
                                                  ids
                                              ),
                                              total: calculateTotal(data.total, data.tree, tree)
                                          })
                                      ),
                                      callback && callback(changes)
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                  ]) as any) as TInstruction;
                              } else {
                                  return (seq([
                                      repo._setData(
                                          R.merge(data, {
                                              newNodes: R.differenceByKey(
                                                  x => x,
                                                  data.newNodes,
                                                  ids
                                              )
                                          })
                                      ),
                                      callback && callback(undefined)
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                  ]) as any) as TInstruction;
                              }
                          })
                  );
        });
    }

    /* istanbul ignore next */
    private __isNodeLoaded(nodeId?: TId, recursively = false) {
        if (recursively) {
            const isRecursivelyLoaded = (node?: TNode) =>
                immutableTree.nodesAndEveryDescendant(
                    this._data.tree,
                    x => this.isLoaded(x),
                    node && [node]
                );
            if (nodeId) {
                const node = this.getNodeById(nodeId);
                return !!node && isRecursivelyLoaded(node);
            } else {
                return isRecursivelyLoaded();
            }
        } else {
            const node = nodeId && this.getNodeById(nodeId);
            return !nodeId ? this._data.loaded : node ? this.isLoaded(node) : false;
        }
    }

    /* istanbul ignore next */
    private __setId(id: TId, node: TNode): TNode {
        return this._params.setId
            ? this._params.setId(id, node)
            : // eslint-disable-next-line @typescript-eslint/no-explicit-any
              R.setPropChanged<any, any>('id', id, node);
    }

    private __takeNodesFromCache({ tree, cache: cache_ }: Pick<TStoredData, 'tree' | 'cache'>) {
        let replaced = false;
        const cache = R.shallowCopy(cache_);
        do {
            replaced = false;
            for (const cacheNodeId in cache) {
                const cacheNode = immutableTree.getNodeBySimilar(
                    tree,
                    this.getId,
                    R.cast<TId>(cacheNodeId)
                );
                if (
                    cacheNode &&
                    cache[cacheNodeId] &&
                    immutableTree.getChildren(tree, cacheNode).length === 0
                ) {
                    tree = immutableTree.replaceChildren(tree, cacheNode, cache[cacheNodeId]);
                    delete cache[cacheNodeId];
                    replaced = true;
                }
            }
        } while (replaced);

        return tree;
    }

    /* istanbul ignore next */
    private __wrapInstruction(instruction: reduxCmp.IAnyInstruction): TInstruction {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (this.__nodeId ? bindInstruction(instruction, this.__nodeId) : instruction) as any;
    }
}
export default Repository;

/* istanbul ignore next */
export const calculateTotal = <TNode>(
    oldTotal: number,
    prev: ITree<TNode>,
    current: ITree<TNode>
) =>
    oldTotal === -1
        ? -1
        : oldTotal +
          (immutableTree.getChildren(current, undefined).length -
                immutableTree.getChildren(prev, undefined).length) ? s : s ? s : s
                    ? s : s ? s : s ? s : s ? s : s;

export type IStandardRepoParams<
    TNode extends { id: TId },
    TId extends HashKey,
    TInstruction extends reduxCmp.IAnyInstruction,
    TStoredData extends IRepositoryData<TNode, TId> = IRepositoryData<TNode, TId>,
    TUpdateError = IError,
    TRemoveError = IError,
    TRemoveOptions = {}
> = [
    IGetRepository<
        TNode,
        TId,
        TInstruction,
        TStoredData,
        TUpdateError,
        TRemoveError,
        TRemoveOptions
    >,
    ISetData<TNode, TId, TInstruction, TStoredData>,
    IStandardParams<
        TNode,
        TId,
        TInstruction,
        TStoredData,
        TUpdateError,
        TRemoveError,
        TRemoveOptions
    >?
];

export class StandardRepository<
    TNode extends { id: TId },
    TId extends HashKey,
    TInstruction extends reduxCmp.IAnyInstruction,
    TStoredData extends IRepositoryData<TNode, TId> = IRepositoryData<TNode, TId>,
    TUpdateError = IError,
    TRemoveError = IError,
    TRemoveOptions = {}
> extends Repository<
    TNode,
    TId,
    TInstruction,
    TStoredData,
    TUpdateError,
    TRemoveError,
    TRemoveOptions
> {
    constructor(
        data: TStoredData | undefined,
        getRepo: IGetRepository<
            TNode,
            TId,
            TInstruction,
            TStoredData,
            TUpdateError,
            TRemoveError,
            TRemoveOptions
        >,
        setRepo: ISetData<TNode, TId, TInstruction, TStoredData>,
        params?: IStandardParams<
            TNode,
            TId,
            TInstruction,
            TStoredData,
            TUpdateError,
            TRemoveError,
            TRemoveOptions
        >
    );

    constructor(
        data: TStoredData | undefined,
        getRepo: IGetRepository<
            TNode,
            TId,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            any,
            TStoredData,
            TUpdateError,
            TRemoveError,
            TRemoveOptions
        >,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setRepo: ISetData<TNode, TId, any, TStoredData>,
        params:
            | IStandardParams<
                  TNode,
                  TId,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  any,
                  TStoredData,
                  TUpdateError,
                  TRemoveError,
                  TRemoveOptions
              >
            | undefined,
        __nodeId__: number
    );

    constructor(
        repo: StandardRepository<
            TNode,
            TId,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            any,
            TStoredData,
            TUpdateError,
            TRemoveError,
            TRemoveOptions
        >,
        __nodeId__: number
    );

    /* istanbul ignore next */
    // eslint-disable-next-line max-params
    constructor(
        data:
            | TStoredData
            | undefined
            | StandardRepository<
                  TNode,
                  TId,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  any,
                  TStoredData,
                  TUpdateError,
                  TRemoveError,
                  TRemoveOptions
              >,
        getRepo:
            | IGetRepository<
                  TNode,
                  TId,
                  TInstruction,
                  TStoredData,
                  TUpdateError,
                  TRemoveError,
                  TRemoveOptions
              >
            | number,
        setRepo?: ISetData<TNode, TId, TInstruction, TStoredData>,
        params?: IStandardParams<
            TNode,
            TId,
            TInstruction,
            TStoredData,
            TUpdateError,
            TRemoveError,
            TRemoveOptions
        >,
        __nodeId__?: number
    ) {
        if (typeof getRepo === 'number') {
            const repo = data as StandardRepository<
                TNode,
                TId,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                any,
                TStoredData,
                TUpdateError,
                TRemoveError,
                TRemoveOptions
            >;
            super(
                repo._data,
                repo.getNewVersion,
                repo._setData,
                (repo._params || {}) as IParams<
                    TNode,
                    TId,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    any,
                    TStoredData,
                    TUpdateError,
                    TRemoveError,
                    TRemoveOptions
                >,
                getRepo
            );
        } else {
            super(
                data as TStoredData | undefined,
                getRepo,
                setRepo!,
                (params || {}) as IParams<
                    TNode,
                    TId,
                    TInstruction,
                    TStoredData,
                    TUpdateError,
                    TRemoveError,
                    TRemoveOptions
                >,
                __nodeId__
            );
        }
    }

    /* istanbul ignore next */
    asBindableProp(): StandardRepository<
        TNode,
        TId,
        reduxCmp.IBoundInstruction,
        TStoredData,
        TUpdateError,
        TRemoveError,
        TRemoveOptions
    > {
        return super.asBindableProp();
    }

    /* istanbul ignore next */
    bindAsProp(
        nodeId: number
    ): StandardRepository<
        TNode,
        TId,
        reduxCmp.IBoundInstruction,
        TStoredData,
        TUpdateError,
        TRemoveError,
        TRemoveOptions
    > {
        return super.bindAsProp(nodeId);
    }
}
