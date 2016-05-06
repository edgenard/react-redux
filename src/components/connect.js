import { Component, createElement } from 'react'
import storeShape from '../utils/storeShape'
import shallowEqual from '../utils/shallowEqual'
import wrapActionCreators from '../utils/wrapActionCreators'
import warning from '../utils/warning'
import isPlainObject from 'lodash/isPlainObject'
import hoistStatics from 'hoist-non-react-statics'
import invariant from 'invariant'

const defaultMapStateToProps = state => ({}) // eslint-disable-line no-unused-vars 
const defaultMapDispatchToProps = dispatch => ({ dispatch })
const defaultMergeProps = (stateProps, dispatchProps, parentProps) => ({
  ...parentProps,
  ...stateProps,
  ...dispatchProps
})
// The three above functions will give fallback values for the connect function

function getDisplayName(WrappedComponent) {
  return WrappedComponent.displayName || WrappedComponent.name || 'Component'
}
// This function will get the name of the presentational component passed as the argument to the curried function

let errorObject = { value: null }
function tryCatch(fn, ctx) {
  try {
    return fn.apply(ctx)
  } catch (e) {
    errorObject.value = e
    return errorObject
  }
}

//The above function is a general TryCatch function that takes a function and a value,
//using apply it calls the function with the value which is an array and catches the error putting the 
//error message in an errorObject

// Helps track hot reloading.
let nextVersion = 0

//The actual connect function
export default function connect(mapStateToProps, mapDispatchToProps, mergeProps, options = {}) {
  const shouldSubscribe = Boolean(mapStateToProps)// This takes the mapStateToProps functions and if it is undefined returns false
  //if this is false that means that this component should not be listening to updates to the state. 
  const mapState = mapStateToProps || defaultMapStateToProps// If mapStateToProps is undefined the default map state functions
  // defined earlier is used. 

  let mapDispatch
  if (typeof mapDispatchToProps === 'function') {//Checks if mapDispatchToProps was passed in as a function
    mapDispatch = mapDispatchToProps//mapDispatch is now the thing passed in
  } else if (!mapDispatchToProps) {//checks if it was passed in at all. 
    mapDispatch = defaultMapDispatchToProps//using the default function defined above
  } else {//if passed in but not a function then pass it to the function wrapActionCreators which returns something
    mapDispatch = wrapActionCreators(mapDispatchToProps)//
  }

  const finalMergeProps = mergeProps || defaultMergeProps//If mergeProps was passed it comes finalMergeProps else the default is used.
  const { pure = true, withRef = false } = options//destructures the options object passing in default values if it wasn't given 
  //or one of the values it  wasn't given.
  const checkMergedEquals = pure && finalMergeProps !== defaultMergeProps// if the pure option was passed in as true or
  //The default version verson was given and mergeProps function was passed in checkMergedEquals becomes true

  // Helps track hot reloading.
  const version = nextVersion++

  return function wrapWithConnect(WrappedComponent) {//The returned function that takes in the presentational component
  //which will get wrapped with a container component
    const connectDisplayName = `Connect(${getDisplayName(WrappedComponent)})`//Using the getDisplayName function to get
    // the name of the given component

    function checkStateShape(props, methodName) {
      //This seems to check if the props passed in to the component, I think the wrappedComponent.
      //If it is not then an error gets gets written saying that the method in the wrappedComponent must return a plain object.
      if (!isPlainObject(props)) {
        warning(
          `${methodName}() in ${connectDisplayName} must return a plain object. ` +
          `Instead received ${props}.`
        )
      }
    }

    function computeMergedProps(stateProps, dispatchProps, parentProps) {
      //this function takes props for the state, any dispatch actions and any props inherited from context
      // It calls merged props passing in the arguments and gets an object that holds the merged properties
      // If it is in production it checks that the mergedProps is a plain object(The checkStateShape function
      // will warn if it is not). Then it returns the mergedProps
      const mergedProps = finalMergeProps(stateProps, dispatchProps, parentProps)
      if (process.env.NODE_ENV !== 'production') {
        checkStateShape(mergedProps, 'mergeProps')
      }
      return mergedProps
    }

    class Connect extends Component {
      //This is the 
      shouldComponentUpdate() {
        return !pure || this.haveOwnPropsChanged || this.hasStoreStateChanged
      }

      constructor(props, context) {
        super(props, context)
        this.version = version
        this.store = props.store || context.store

        invariant(this.store,
          `Could not find "store" in either the context or ` +
          `props of "${connectDisplayName}". ` +
          `Either wrap the root component in a <Provider>, ` +
          `or explicitly pass "store" as a prop to "${connectDisplayName}".`
        )

        const storeState = this.store.getState()
        this.state = { storeState }
        this.clearCache()
      }

      computeStateProps(store, props) {
        if (!this.finalMapStateToProps) {
          return this.configureFinalMapState(store, props)
        }

        const state = store.getState()
        const stateProps = this.doStatePropsDependOnOwnProps ?
          this.finalMapStateToProps(state, props) :
          this.finalMapStateToProps(state)

        if (process.env.NODE_ENV !== 'production') {
          checkStateShape(stateProps, 'mapStateToProps')
        }
        return stateProps
      }

      configureFinalMapState(store, props) {
        const mappedState = mapState(store.getState(), props)
        const isFactory = typeof mappedState === 'function'

        this.finalMapStateToProps = isFactory ? mappedState : mapState
        this.doStatePropsDependOnOwnProps = this.finalMapStateToProps.length !== 1

        if (isFactory) {
          return this.computeStateProps(store, props)
        }

        if (process.env.NODE_ENV !== 'production') {
          checkStateShape(mappedState, 'mapStateToProps')
        }
        return mappedState
      }

      computeDispatchProps(store, props) {
        if (!this.finalMapDispatchToProps) {
          return this.configureFinalMapDispatch(store, props)
        }

        const { dispatch } = store
        const dispatchProps = this.doDispatchPropsDependOnOwnProps ?
          this.finalMapDispatchToProps(dispatch, props) :
          this.finalMapDispatchToProps(dispatch)

        if (process.env.NODE_ENV !== 'production') {
          checkStateShape(dispatchProps, 'mapDispatchToProps')
        }
        return dispatchProps
      }

      configureFinalMapDispatch(store, props) {
        const mappedDispatch = mapDispatch(store.dispatch, props)
        const isFactory = typeof mappedDispatch === 'function'

        this.finalMapDispatchToProps = isFactory ? mappedDispatch : mapDispatch
        this.doDispatchPropsDependOnOwnProps = this.finalMapDispatchToProps.length !== 1

        if (isFactory) {
          return this.computeDispatchProps(store, props)
        }

        if (process.env.NODE_ENV !== 'production') {
          checkStateShape(mappedDispatch, 'mapDispatchToProps')
        }
        return mappedDispatch
      }

      updateStatePropsIfNeeded() {
        const nextStateProps = this.computeStateProps(this.store, this.props)
        if (this.stateProps && shallowEqual(nextStateProps, this.stateProps)) {
          return false
        }

        this.stateProps = nextStateProps
        return true
      }

      updateDispatchPropsIfNeeded() {
        const nextDispatchProps = this.computeDispatchProps(this.store, this.props)
        if (this.dispatchProps && shallowEqual(nextDispatchProps, this.dispatchProps)) {
          return false
        }

        this.dispatchProps = nextDispatchProps
        return true
      }

      updateMergedPropsIfNeeded() {
        const nextMergedProps = computeMergedProps(this.stateProps, this.dispatchProps, this.props)
        if (this.mergedProps && checkMergedEquals && shallowEqual(nextMergedProps, this.mergedProps)) {
          return false
        }

        this.mergedProps = nextMergedProps
        return true
      }

      isSubscribed() {
        return typeof this.unsubscribe === 'function'
      }

      trySubscribe() {
        if (shouldSubscribe && !this.unsubscribe) {
          this.unsubscribe = this.store.subscribe(this.handleChange.bind(this))
          this.handleChange()
        }
      }

      tryUnsubscribe() {
        if (this.unsubscribe) {
          this.unsubscribe()
          this.unsubscribe = null
        }
      }

      componentDidMount() {
        this.trySubscribe()
      }

      componentWillReceiveProps(nextProps) {
        if (!pure || !shallowEqual(nextProps, this.props)) {
          this.haveOwnPropsChanged = true
        }
      }

      componentWillUnmount() {
        this.tryUnsubscribe()
        this.clearCache()
      }

      clearCache() {
        this.dispatchProps = null
        this.stateProps = null
        this.mergedProps = null
        this.haveOwnPropsChanged = true
        this.hasStoreStateChanged = true
        this.haveStatePropsBeenPrecalculated = false
        this.statePropsPrecalculationError = null
        this.renderedElement = null
        this.finalMapDispatchToProps = null
        this.finalMapStateToProps = null
      }

      handleChange() {
        if (!this.unsubscribe) {
          return
        }

        const storeState = this.store.getState()
        const prevStoreState = this.state.storeState
        if (pure && prevStoreState === storeState) {
          return
        }

        if (pure && !this.doStatePropsDependOnOwnProps) {
          const haveStatePropsChanged = tryCatch(this.updateStatePropsIfNeeded, this)
          if (!haveStatePropsChanged) {
            return
          }
          if (haveStatePropsChanged === errorObject) {
            this.statePropsPrecalculationError = errorObject.value
          }
          this.haveStatePropsBeenPrecalculated = true
        }

        this.hasStoreStateChanged = true
        this.setState({ storeState })
      }

      getWrappedInstance() {
        invariant(withRef,
          `To access the wrapped instance, you need to specify ` +
          `{ withRef: true } as the fourth argument of the connect() call.`
        )

        return this.refs.wrappedInstance
      }

      render() {
        const {
          haveOwnPropsChanged,
          hasStoreStateChanged,
          haveStatePropsBeenPrecalculated,
          statePropsPrecalculationError,
          renderedElement
        } = this

        this.haveOwnPropsChanged = false
        this.hasStoreStateChanged = false
        this.haveStatePropsBeenPrecalculated = false
        this.statePropsPrecalculationError = null

        if (statePropsPrecalculationError) {
          throw statePropsPrecalculationError
        }

        let shouldUpdateStateProps = true
        let shouldUpdateDispatchProps = true
        if (pure && renderedElement) {
          shouldUpdateStateProps = hasStoreStateChanged || (
            haveOwnPropsChanged && this.doStatePropsDependOnOwnProps
          )
          shouldUpdateDispatchProps =
            haveOwnPropsChanged && this.doDispatchPropsDependOnOwnProps
        }

        let haveStatePropsChanged = false
        let haveDispatchPropsChanged = false
        if (haveStatePropsBeenPrecalculated) {
          haveStatePropsChanged = true
        } else if (shouldUpdateStateProps) {
          haveStatePropsChanged = this.updateStatePropsIfNeeded()
        }
        if (shouldUpdateDispatchProps) {
          haveDispatchPropsChanged = this.updateDispatchPropsIfNeeded()
        }

        let haveMergedPropsChanged = true
        if (
          haveStatePropsChanged ||
          haveDispatchPropsChanged ||
          haveOwnPropsChanged
        ) {
          haveMergedPropsChanged = this.updateMergedPropsIfNeeded()
        } else {
          haveMergedPropsChanged = false
        }

        if (!haveMergedPropsChanged && renderedElement) {
          return renderedElement
        }

        if (withRef) {
          this.renderedElement = createElement(WrappedComponent, {
            ...this.mergedProps,
            ref: 'wrappedInstance'
          })
        } else {
          this.renderedElement = createElement(WrappedComponent,
            this.mergedProps
          )
        }

        return this.renderedElement
      }
    }

    Connect.displayName = connectDisplayName
    Connect.WrappedComponent = WrappedComponent
    Connect.contextTypes = {
      store: storeShape
    }
    Connect.propTypes = {
      store: storeShape
    }

    if (process.env.NODE_ENV !== 'production') {
      Connect.prototype.componentWillUpdate = function componentWillUpdate() {
        if (this.version === version) {
          return
        }

        // We are hot reloading!
        this.version = version
        this.trySubscribe()
        this.clearCache()
      }
    }

    return hoistStatics(Connect, WrappedComponent)
  }
}
